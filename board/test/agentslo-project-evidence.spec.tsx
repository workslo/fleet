import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectEvidencePanel } from "../src/components/ProjectEvidencePanel";
import type { Evidence } from "../src/api";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProjectEvidencePanel", () => {
  it("shows an empty-state message when no evidence exists", () => {
    render(<ProjectEvidencePanel evidence={[]} />);
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeVisible();
    expect(screen.getByText("No evidence links have been recorded.")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders each evidence item as a link with its summary", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Fleet Pulse corrective PR" },
      { uri: "https://example.com/doc", summary: "Architecture decision record" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("link", { name: "Fleet Pulse corrective PR" })).toHaveAttribute(
      "href",
      "https://github.com/workslo/fleet/pull/50",
    );
    expect(screen.getByRole("link", { name: "Architecture decision record" })).toHaveAttribute(
      "href",
      "https://example.com/doc",
    );
  });

  it("classifies GitHub PRs and groups them under a Pull Request heading with a count", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Corrective items" },
      { uri: "https://github.com/workslo/fleet/pull/46", summary: "PulseService coalescing" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("heading", { name: "Pull Request (2)" })).toBeVisible();
    expect(screen.getByText("PR #50")).toBeVisible();
    expect(screen.getByText("PR #46")).toBeVisible();
  });

  it("classifies GitHub issues separately from PRs", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/issues/120", summary: "Fleet Pulse tracking" },
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Corrective PR" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("heading", { name: "Pull Request (1)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Issue (1)" })).toBeVisible();
    expect(screen.getByText("Issue #120")).toBeVisible();
    expect(screen.getByText("PR #50")).toBeVisible();
  });

  it("classifies generic links under a Link heading", () => {
    const evidence: Evidence[] = [
      { uri: "https://example.com/spec", summary: "Evidence contract spec" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("heading", { name: "Link (1)" })).toBeVisible();
    expect(screen.getByText("Link")).toBeVisible();
  });

  it("groups mixed evidence types with separate headings and counts", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Corrective PR" },
      { uri: "https://github.com/workslo/fleet/pull/46", summary: "Coalescing fix" },
      { uri: "https://github.com/workslo/fleet/issues/120", summary: "Tracking issue" },
      { uri: "https://example.com/adr-001", summary: "ADR: evidence panel" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("heading", { name: "Pull Request (2)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Issue (1)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Link (1)" })).toBeVisible();
  });

  it("shows a relative timestamp when created_at is present", () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });

    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Corrective PR", created_at: "2026-09-01T10:00:00Z" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    const time = screen.getByText(/2h ago/);
    expect(time).toBeVisible();
    expect(time.closest("time")).toHaveAttribute("dateTime", "2026-09-01T10:00:00Z");
  });

  it("sorts evidence within a group newest-first by created_at", () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });

    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/46", summary: "Older PR", created_at: "2026-08-28T00:00:00Z" },
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "Newer PR", created_at: "2026-09-01T10:00:00Z" },
      { uri: "https://github.com/workslo/fleet/pull/48", summary: "Middle PR", created_at: "2026-08-30T00:00:00Z" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    const list = screen.getByRole("heading", { name: "Pull Request (3)" })
      .parentElement!.querySelector("ul")!;
    const links = list.querySelectorAll("a");
    expect(links[0]).toHaveTextContent("Newer PR");
    expect(links[1]).toHaveTextContent("Middle PR");
    expect(links[2]).toHaveTextContent("Older PR");
  });

  it("omits the timestamp element when created_at is absent", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet/pull/50", summary: "No timestamp PR" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.queryByRole("time")).toBeNull();
    expect(screen.getByRole("link", { name: "No timestamp PR" })).toBeVisible();
  });

  it("classifies bare GitHub repository URLs as Repository type", () => {
    const evidence: Evidence[] = [
      { uri: "https://github.com/workslo/fleet", summary: "Foundation repository" },
    ];
    render(<ProjectEvidencePanel evidence={evidence} />);

    expect(screen.getByRole("heading", { name: "Repository (1)" })).toBeVisible();
    expect(screen.getByText("Repository")).toBeVisible();
  });
});
