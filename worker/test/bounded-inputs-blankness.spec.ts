import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// workslo/fleet#9, found by @agentslo reviewing PR #52.
//
// The D1 floor in migration 0008 asked whether a required field was blank with SQLite's
// one-argument trim(), which strips ASCII space and nothing else — not a tab, a newline, a
// non-breaking space or an ideographic space. The Worker boundary asks the same question
// with String.trim(), which strips all of them. The two layers disagreed about one word: a
// tab-only title earned a 400 at the HTTP gate and was accepted by a direct INSERT beneath
// it, which is exactly the bypass the floor exists to close.
//
// Migration 0008 now names an explicit charset, and that charset is exactly ECMAScript's
// WhiteSpace plus LineTerminator set. Every string below is one String.trim() calls blank,
// and every one of them was accepted by the floor before the fix.
const BLANK_TO_THE_WORKER = [
  "\t", "\n", "\r", "\u000b", "\u000c", " ", " ", " ",
  " ", " ", " ", " ", "　", "﻿", " \t 　 ",
];

const insertProject = (title: string) => env.DB.prepare(
  "INSERT INTO projects (id, slug, title, originator_id, submitter_id, state) VALUES (?, ?, ?, 'shane', 'shane', 'Proposed')",
).bind(crypto.randomUUID(), `blank-${crypto.randomUUID()}`, title).run();

describe("the D1 floor and the Worker agree on what blank means", () => {
  it("refuses every string the Worker boundary would call blank", async () => {
    for (const blank of BLANK_TO_THE_WORKER) {
      expect(blank.trim()).toBe("");
      await expect(insertProject(blank)).rejects.toThrow();
    }
  });

  it("does not mistake padded or interior whitespace for blank", async () => {
    await expect(insertProject(" Ship it\t")).resolves.toBeTruthy();
    await expect(insertProject("a b")).resolves.toBeTruthy();
    await expect(insertProject("  Ship it  ")).resolves.toBeTruthy();
  });

  // Read off the shipped schema rather than the migration file, so a re-spelling of the
  // charset in a later migration fails here rather than drifting quietly.
  it("asks the question the same way in every shipped trigger", async () => {
    const triggers = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_bounded'",
    ).all<{ sql: string }>();
    const sql = triggers.results.map((row) => row.sql).join("\n");
    expect(sql).not.toMatch(/trim\(NEW\.[a-z_]+\)/);
    expect(sql).toContain(
      "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)",
    );
  });
});
