import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig, defineProject } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const validIssuer = "https://fleet-test.cloudflareaccess.com";

function workerProject(name: string, include: string[], issuer = validIssuer, exclude: string[] = []) {
  return defineProject({
    plugins: [
      cloudflareTest(async () => ({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            FLEET_ACCESS_AUDIENCE: "fleet-test-audience",
            FLEET_ACCESS_ISSUER: issuer,
            FLEET_ACCESS_JWKS_URL: `${validIssuer}/cdn-cgi/access/certs`,
            TEST_MIGRATIONS: await readD1Migrations(path.join(projectRoot, "worker/migrations")),
          },
        },
      })),
    ],
    test: {
      name,
      include,
      exclude,
      setupFiles: ["./worker/test/apply-migrations.ts"],
    },
  });
}

export default defineConfig({
  test: {
    projects: [
      workerProject("worker", ["worker/test/**/*.spec.ts"], validIssuer, [
        "worker/test/production-identity-misconfig.spec.ts",
        "worker/test/production-identity.spec.ts",
      ]),
      workerProject("worker-production-identity", ["worker/test/production-identity.spec.ts"]),
      workerProject("worker-auth-misconfig", ["worker/test/production-identity-misconfig.spec.ts"], "http://fleet-test.cloudflareaccess.com"),
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
