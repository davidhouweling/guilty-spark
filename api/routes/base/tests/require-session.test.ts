import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { requireSession } from "../require-session";
import type { Services } from "../../../services/install";

function aRequest(env: Env): Request {
  return new Request("http://localhost/api/identities", { method: "GET", headers: { Origin: env.PAGES_URL } });
}

describe("requireSession", () => {
  let env: Env;
  let services: Services;

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
  });

  it("returns the session when it is valid", async () => {
    expect.assertions(2);
    const session = aFakeAuthSessionWith();
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(session);

    const result = await requireSession(aRequest(env), services.authService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toEqual(session);
    }
  });

  it("returns a 401 response without clearing the cookie when no session exists", async () => {
    expect.assertions(3);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);

    const result = await requireSession(aRequest(env), services.authService);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("Set-Cookie")).toBeNull();
    }
  });

  it("refreshes and returns the session when expired but refresh succeeds", async () => {
    expect.assertions(3);
    const refreshedExpiresAt = Date.now() + 7200000;
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(
      aFakeAuthSessionWith({ isExpired: true, expiresAt: Date.now() - 1000 }),
    );
    vi.spyOn(services.authService, "refreshSession").mockResolvedValue({
      sessionId: "session-123",
      userId: "user-123",
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
      expiresAt: refreshedExpiresAt,
      issuedAt: Date.now(),
    });

    const result = await requireSession(aRequest(env), services.authService);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.accessToken).toBe("fresh-access-token");
      expect(result.session.isExpired).toBe(false);
    }
  });

  it("returns a 401 and clears the cookie when expired and refresh returns null", async () => {
    expect.assertions(2);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ isExpired: true }));
    vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);

    const result = await requireSession(aRequest(env), services.authService);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    }
  });

  it("returns a 401 and clears the cookie when refresh throws", async () => {
    expect.assertions(2);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ isExpired: true }));
    vi.spyOn(services.authService, "refreshSession").mockRejectedValue(new Error("refresh boom"));

    const result = await requireSession(aRequest(env), services.authService);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    }
  });
});
