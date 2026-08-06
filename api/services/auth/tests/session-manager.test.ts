import { describe, it, expect } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { SessionManager } from "../session-manager";

describe("SessionManager", () => {
  it("creates and validates a signed opaque value", async () => {
    const sessionSecret = "a".repeat(64); // 32 bytes = 64 hex chars
    const manager = new SessionManager(sessionSecret);

    const value = "session-123";
    const token = await manager.createSignedToken(value);

    expect(token).toContain(".");
    const [payloadPart, signature] = token.split(".");
    expect(payloadPart).toBeTruthy();
    expect(signature).toBeTruthy();

    const validated = await manager.validateSignedToken(token);
    expect(validated).toBe(value);
  });

  it("rejects tampered token", async () => {
    const sessionSecret = "b".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const token = await manager.createSignedToken("session-123");

    const [payloadPart] = token.split(".");
    const tamperedToken = `${payloadPart ?? ""}.fake-signature`;

    const validated = await manager.validateSignedToken(tamperedToken);
    expect(validated).toBeNull();
  });

  it("rejects invalid token format", async () => {
    const sessionSecret = "d".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const validated = await manager.validateSignedToken("invalid-format");
    expect(validated).toBeNull();
  });

  it("throws on invalid session secret length", () => {
    expect(() => new SessionManager("too-short")).toThrow();
  });

  it("throws on non-hex session secret", () => {
    expect(() => new SessionManager("z".repeat(64))).toThrow();
  });

  it("sets session cookie with correct attributes", () => {
    const sessionSecret = "e".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.setSessionCookie(response, "test-token");

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-session=")),
      "auth-session cookie",
    );
    const presenceCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-presence=")),
      "auth-presence cookie",
    );

    expect(sessionCookie).toContain("auth-session=test-token");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("Max-Age=2592000");

    expect(presenceCookie).toContain("auth-presence=1");
    expect(presenceCookie).not.toContain("HttpOnly");
    expect(presenceCookie).toContain("Secure");
    expect(presenceCookie).toContain("SameSite=Strict");
  });

  it("sets session cookie with a Domain attribute when cookieDomain is configured", () => {
    const sessionSecret = "6".repeat(64);
    const manager = new SessionManager(sessionSecret, "guilty-spark.app");

    const response = new Response();
    manager.setSessionCookie(response, "test-token");

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-session=")),
      "auth-session cookie",
    );
    const presenceCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-presence=")),
      "auth-presence cookie",
    );

    expect(sessionCookie).toContain("Domain=guilty-spark.app");
    expect(presenceCookie).toContain("Domain=guilty-spark.app");
  });

  it("omits the Domain attribute when cookieDomain is not configured", () => {
    const sessionSecret = "7".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.setSessionCookie(response, "test-token");

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-session=")),
      "auth-session cookie",
    );
    const presenceCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-presence=")),
      "auth-presence cookie",
    );

    expect(sessionCookie).not.toContain("Domain=");
    expect(presenceCookie).not.toContain("Domain=");
  });

  it("clears session cookie with a matching Domain attribute when cookieDomain is configured", () => {
    const sessionSecret = "8".repeat(64);
    const manager = new SessionManager(sessionSecret, "guilty-spark.app");

    const response = new Response();
    manager.clearSessionCookie(response);

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-session=")),
      "auth-session cookie",
    );
    const presenceCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-presence=")),
      "auth-presence cookie",
    );

    expect(sessionCookie).toContain("Domain=guilty-spark.app");
    expect(presenceCookie).toContain("Domain=guilty-spark.app");
  });

  it("also clears the legacy host-only cookies when setting a domain-scoped session cookie", () => {
    const sessionSecret = "a1".repeat(32);
    const manager = new SessionManager(sessionSecret, "guilty-spark.app");

    const response = new Response();
    manager.setSessionCookie(response, "test-token");

    const setCookies = response.headers.getSetCookie();
    const sessionCookies = setCookies.filter((cookie) => cookie.startsWith("auth-session="));
    const presenceCookies = setCookies.filter((cookie) => cookie.startsWith("auth-presence="));

    expect(sessionCookies).toHaveLength(2);
    expect(
      sessionCookies.some((cookie) => cookie.includes("Domain=guilty-spark.app") && cookie.includes("test-token")),
    ).toBe(true);
    expect(sessionCookies.some((cookie) => !cookie.includes("Domain=") && cookie.includes("Max-Age=0"))).toBe(true);

    expect(presenceCookies).toHaveLength(2);
    expect(
      presenceCookies.some(
        (cookie) => cookie.includes("Domain=guilty-spark.app") && cookie.includes("auth-presence=1"),
      ),
    ).toBe(true);
    expect(presenceCookies.some((cookie) => !cookie.includes("Domain=") && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("does not emit legacy clear cookies when cookieDomain is not configured", () => {
    const sessionSecret = "a2".repeat(32);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.setSessionCookie(response, "test-token");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies.filter((cookie) => cookie.startsWith("auth-session="))).toHaveLength(1);
    expect(setCookies.filter((cookie) => cookie.startsWith("auth-presence="))).toHaveLength(1);
  });

  it("also clears the legacy host-only cookies when clearing a domain-scoped session cookie", () => {
    const sessionSecret = "a3".repeat(32);
    const manager = new SessionManager(sessionSecret, "guilty-spark.app");

    const response = new Response();
    manager.clearSessionCookie(response);

    const setCookies = response.headers.getSetCookie();
    const sessionCookies = setCookies.filter((cookie) => cookie.startsWith("auth-session="));
    const presenceCookies = setCookies.filter((cookie) => cookie.startsWith("auth-presence="));

    expect(sessionCookies).toHaveLength(2);
    expect(sessionCookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect(sessionCookies.some((cookie) => cookie.includes("Domain=guilty-spark.app"))).toBe(true);
    expect(sessionCookies.some((cookie) => !cookie.includes("Domain="))).toBe(true);

    expect(presenceCookies).toHaveLength(2);
    expect(presenceCookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect(presenceCookies.some((cookie) => cookie.includes("Domain=guilty-spark.app"))).toBe(true);
    expect(presenceCookies.some((cookie) => !cookie.includes("Domain="))).toBe(true);
  });

  it("does not apply cookieDomain to the PKCE state cookie", () => {
    const sessionSecret = "9".repeat(64);
    const manager = new SessionManager(sessionSecret, "guilty-spark.app");

    const response = new Response();
    manager.setPkceStateCookie(response, "signed-pkce-token");

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).not.toContain("Domain=");
  });

  it("clears session cookie on logout", () => {
    const sessionSecret = "f".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    manager.clearSessionCookie(response);

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-session=")),
      "auth-session cookie",
    );
    const presenceCookie = Preconditions.checkExists(
      setCookies.find((cookie) => cookie.startsWith("auth-presence=")),
      "auth-presence cookie",
    );

    expect(sessionCookie).toContain("Max-Age=0");
    expect(sessionCookie).toContain("Expires=Thu, 01 Jan 1970");
    expect(presenceCookie).toContain("Max-Age=0");
    expect(presenceCookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("extracts session token from request cookies", () => {
    const sessionSecret = "1".repeat(64);
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
    const sessionSecret = "2".repeat(64);
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
    const sessionSecret = "3".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const request = new Request("http://localhost");

    const token = manager.extractSessionToken(request);
    expect(token).toBeNull();
  });

  it("sets and extracts PKCE state cookies", () => {
    const sessionSecret = "4".repeat(64);
    const manager = new SessionManager(sessionSecret);

    const response = new Response();
    const signedToken = "signed-pkce-token";

    manager.setPkceStateCookie(response, signedToken);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-pkce-state=signed-pkce-token");
    expect(setCookie).toContain("SameSite=Lax");

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-pkce-state=${signedToken}`,
      },
    });

    expect(manager.extractPkceStateToken(request)).toBe(signedToken);
  });
});
