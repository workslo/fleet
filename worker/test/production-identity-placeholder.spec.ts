import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Fleet production identity placeholders", () => {
  it("fails closed before token processing with the checked-in issuer placeholder", async () => {
    const response = await exports.default.fetch("https://fleet.test/v1/me", {
      headers: { "Cf-Access-Jwt-Assertion": "forged-token" },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "auth_unavailable",
      message: "production authentication is not configured",
    });
  });
});
