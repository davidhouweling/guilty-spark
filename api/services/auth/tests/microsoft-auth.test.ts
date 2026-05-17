import { describe, it, expect, vi, beforeEach } from "vitest";
import { MicrosoftAuthService } from "../microsoft-auth";
import { aFakeAuthenticatedUser } from "../fakes/data";

describe("MicrosoftAuthService", () => {
  let service: MicrosoftAuthService;

  beforeEach(() => {
    service = new MicrosoftAuthService({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:8787/auth/microsoft/callback",
      tenant: "consumers",
    });
  });

  it("generates PKCE code verifier and challenge", async () => {
    const { codeVerifier, codeChallenge } = await service.generatePKCE();

    expect(codeVerifier).toHaveLength(128);
    expect(codeChallenge).toBeTruthy();
    expect(codeChallenge).not.toBe(codeVerifier); // Challenge should be hashed
  });

  it("generates random state parameter", () => {
    const state1 = service.generateState();
    const state2 = service.generateState();

    expect(state1).toBeTruthy();
    expect(state2).toBeTruthy();
    expect(state1).not.toBe(state2); // Should be different on each call
  });

  it("builds authorization URL with correct parameters", () => {
    const codeChallenge = "test-challenge";
    const state = "test-state";

    const url = service.getAuthorizationUrl(codeChallenge, state);

    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.pathname).toContain("oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("state")).toBe("test-state");
    expect(url.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("openid");
  });

  it("parses valid ID token", () => {
    const fakeUser = aFakeAuthenticatedUser();

    // Create a fake ID token (header.payload.signature format)
    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64");
    const payload = Buffer.from(
      JSON.stringify({
        sub: fakeUser.sub,
        email: fakeUser.email,
        name: fakeUser.name,
        preferred_username: fakeUser.preferredUsername,
      }),
    ).toString("base64");
    const signature = "fake-signature";
    const idToken = `${header}.${payload}.${signature}`;

    const user = service.parseIdToken(idToken);

    expect(user.sub).toBe(fakeUser.sub);
    expect(user.email).toBe(fakeUser.email);
    expect(user.name).toBe(fakeUser.name);
  });

  it("throws on malformed ID token", () => {
    expect(() => service.parseIdToken("invalid")).toThrow();
  });

  it("throws on ID token missing required claims", () => {
    const incomplete = Buffer.from(
      JSON.stringify({
        sub: "user-123",
        // missing email
      }),
    ).toString("base64");
    const idToken = `header.${incomplete}.signature`;

    expect(() => service.parseIdToken(idToken)).toThrow();
  });

  it("throws on token exchange failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
      ),
    );

    await expect(service.exchangeCodeForTokens("invalid-code", "code-verifier")).rejects.toThrow();
  });

  it("throws on token refresh failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
      ),
    );

    await expect(service.refreshAccessToken("invalid-refresh-token")).rejects.toThrow();
  });
});
