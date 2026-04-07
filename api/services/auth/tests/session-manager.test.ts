import { describe, it, expect } from "vitest";
import { SessionManager } from "../session-manager";
import { aFakeSessionTokenPayload } from "../fakes/data";

describe("SessionManager", () => {
  it("creates and validates a signed session token", async () => {
    const sessionSecret = "a".repeat(64); // 32 bytes = 64 hex chars
    const manager = new SessionManager(sessionSecret);

    const payload = aFakeSessionTokenPayload();
    const token = await manager.createSessionToken(payload);

    expect(token).toContain(".");
    const [payloadPart, signature] = token.split(".");
    expect(payloadPart).toBeTruthy();
    expect(signature).toBeTruthy();

    const validated = await manager.validateSessionToken(token);
    expect(validated).not.toBeNull();
    expect(validated?.userId).toBe(payload.userId);
    expect(validated?.accessToken).toBe(payload.accessToken);
    expect(validated?.isExpired).toBe(false);
  });

  it("rejects tampered token", async () => {
    const sessionSecret = "b".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const payload = aFakeSessionTokenPayload();
    const token = await manager.createSessionToken(payload);

    const [payloadPart] = token.split(".");
    const tamperedToken = `${payloadPart ?? ""}.fake-signature`;

    const validated = await manager.validateSessionToken(tamperedToken);
    expect(validated).toBeNull();
  });

  it("detects expired session", async () => {
    const sessionSecret = "c".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const expiredPayload = aFakeSessionTokenPayload({
      expiresAt: Date.now() - 3600 * 1000, // 1 hour ago
    });
    const token = await manager.createSessionToken(expiredPayload);

    const validated = await manager.validateSessionToken(token);
    expect(validated).not.toBeNull();
    expect(validated?.isExpired).toBe(true);
  });

  it("rejects invalid token format", async () => {
    const sessionSecret = "d".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const validated = await manager.validateSessionToken("invalid-format");
    expect(validated).toBeNull();
  });

  it("throws on invalid session secret length", () => {
    expect(() => new SessionManager("too-short")).toThrow();
  });

  it("sets session cookie with correct attributes", () => {
    const sessionSecret = "e".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.setSessionCookie(response, "test-token", Date.now() + 3600 * 1000);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-session=test-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
  });

  it("clears session cookie on logout", () => {
    const sessionSecret = "f".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.clearSessionCookie(response);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("extracts session token from request cookies", () => {
    const sessionSecret = "g".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const request = new Request("http://localhost", {
      headers: {
        Cookie: "other=value; auth-session=test-token-value; another=data",
      },
    });

    const token = manager.extractSessionToken(request);
    expect(token).toBe("test-token-value");
  });

  it("returns null when session cookie not found", () => {
    const sessionSecret = "h".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const request = new Request("http://localhost", {
      headers: {
        Cookie: "other=value; another=data",
      },
    });

    const token = manager.extractSessionToken(request);
    expect(token).toBeNull();
  });

  it("returns null when no cookies present", () => {
    const sessionSecret = "i".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const request = new Request("http://localhost");

    const token = manager.extractSessionToken(request);
    expect(token).toBeNull();
  });
});
