import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig, defineProject } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      defineProject({
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                FLEET_AUTH_MODE: "test",
                TEST_MIGRATIONS: await readD1Migrations(path.join(projectRoot, "worker/migrations")),
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["worker/test/**/*.spec.ts"],
          setupFiles: ["./worker/test/apply-migrations.ts"],
        },
      }),
      defineProject({
        test: {
          name: "board",
          environment: "jsdom",
          include: ["board/test/**/*.spec.tsx"],
          setupFiles: ["./board/test/setup.ts"],
        },
      }),
    ],
  },
});
