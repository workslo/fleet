import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
    include: ["worker/test/**/*.spec.ts"],
    setupFiles: ["./worker/test/apply-migrations.ts"],
  },
});
