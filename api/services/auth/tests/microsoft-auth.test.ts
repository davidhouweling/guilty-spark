import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MicrosoftAuthService } from "../microsoft-auth";
import { aFakeAuthenticatedUser } from "../fakes/data";
import { aSignedMicrosoftIdTokenWith } from "./id-token-signing";

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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("parses valid ID token", async () => {
    const fakeUser = aFakeAuthenticatedUser();
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      email: fakeUser.email,
      name: fakeUser.name,
      preferredUsername: fakeUser.preferredUsername,
      sub: fakeUser.sub,
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const user = await service.parseIdToken(signedToken.token);

    expect(user.sub).toBe(fakeUser.sub);
    expect(user.email).toBe(fakeUser.email);
    expect(user.name).toBe(fakeUser.name);
  });

  it("throws on malformed ID token", async () => {
    await expect(service.parseIdToken("invalid")).rejects.toThrow();
  });

  it("parses ID token when email claim is missing", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      email: undefined,
      name: undefined,
      preferredUsername: "fallback-user",
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const user = await service.parseIdToken(signedToken.token);

    expect(user.email).toBeUndefined();
    expect(user.name).toBe("fallback-user");
    expect(user.preferredUsername).toBe("fallback-user");
  });

  it("falls back to sub when email and preferred username are missing", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      email: undefined,
      name: undefined,
      preferredUsername: undefined,
      sub: "user-without-email",
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const user = await service.parseIdToken(signedToken.token);

    expect(user.email).toBeUndefined();
    expect(user.name).toBe("user-without-email");
  });

  it("throws on expired ID token", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(service.parseIdToken(signedToken.token)).rejects.toThrow("ID token expired");
  });

  it("throws when ID token is not valid yet", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      notBefore: Math.floor(Date.now() / 1000) + 60,
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Cache-Control": "max-age=60", "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Cache-Control": "max-age=60", "Content-Type": "application/json" },
        }),
      );

    await expect(service.parseIdToken(signedToken.token)).rejects.toThrow("ID token is not valid yet");
  });

  it("throws on ID token with invalid signature", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      tenantId: "test-tenant-id",
    });
    const [header = "", , signature = ""] = signedToken.token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        aud: "test-client-id",
        email: "user@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://login.microsoftonline.com/test-tenant-id/v2.0",
        name: "Tampered User",
        preferred_username: "testuser",
        sub: "user-123",
        tid: "test-tenant-id",
      }),
    ).toString("base64url");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(service.parseIdToken(`${header}.${tamperedPayload}.${signature}`)).rejects.toThrow(
      "Invalid ID token signature",
    );
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

  it("retries once and succeeds when the token exchange fails transiently", async () => {
    const tokens = { access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 };
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tokens), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

    const result = await service.exchangeCodeForTokens("code-123", "code-verifier");

    expect(result).toEqual(tokens);
  });

  it("throws after a second consecutive token exchange failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("persistent failure"));

    await expect(service.exchangeCodeForTokens("code-123", "code-verifier")).rejects.toThrow("persistent failure");
  });

  it("does not retry the token exchange for a non-retryable 4xx status", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));

    await expect(service.exchangeCodeForTokens("code-123", "code-verifier")).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries the token exchange for a retryable 5xx status", async () => {
    const tokens = { access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "server_error" }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tokens), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

    const result = await service.exchangeCodeForTokens("code-123", "code-verifier");

    expect(result).toEqual(tokens);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
