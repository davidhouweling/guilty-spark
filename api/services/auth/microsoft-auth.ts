import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MicrosoftTokenResponse, AuthenticatedUser, PKCEState } from "./types";

/**
 * Microsoft OAuth2 with PKCE (Proof Key for Code Exchange) implementation.
 * Suitable for browser-based auth flow.
 */
export class MicrosoftAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tenant: string; // 'consumers' for personal accounts
  private readonly scopes: string;

  public constructor(config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    tenant?: string | undefined;
    scopes?: string | undefined;
  }) {
    this.clientId = Preconditions.checkExists(config.clientId, "clientId");
    this.clientSecret = Preconditions.checkExists(config.clientSecret, "clientSecret");
    this.redirectUri = Preconditions.checkExists(config.redirectUri, "redirectUri");
    this.tenant = config.tenant ?? "consumers";
    this.scopes = config.scopes ?? "openid profile email offline_access XboxLive.signin XboxLive.offline_access";
  }

  /**
   * Generate PKCE code verifier and challenge.
   * Verifier: 96 random bytes encoded as base64url (128 chars)
   * Challenge: SHA-256 of the verifier, base64url-encoded
   * Uses Buffer.from().toString('base64url') — available via nodejs_compat.
   */
  public async generatePKCE(): Promise<Pick<PKCEState, "codeVerifier" | "codeChallenge">> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(96));
    const codeVerifier = Buffer.from(randomBytes).toString("base64url");

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
    const codeChallenge = Buffer.from(hashBuffer).toString("base64url");

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate a random state parameter for CSRF protection.
   */
  public generateState(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return Buffer.from(randomBytes).toString("base64url");
  }

  /**
   * Build the authorization request URL.
   * User must visit this URL to authenticate and consent.
   */
  public getAuthorizationUrl(codeChallenge: string, state: string): URL {
    const url = new URL(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`);

    url.searchParams.append("client_id", this.clientId);
    url.searchParams.append("response_type", "code");
    url.searchParams.append("redirect_uri", this.redirectUri);
    url.searchParams.append("response_mode", "query");
    url.searchParams.append("scope", this.scopes);
    url.searchParams.append("state", state);
    url.searchParams.append("code_challenge", codeChallenge);
    url.searchParams.append("code_challenge_method", "S256");
    url.searchParams.append("prompt", "select_account");

    return url;
  }

  /**
   * Exchange authorization code for tokens.
   * Must include the original codeVerifier used in the authorization request.
   */
  public async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
    const url = new URL(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`);

    const body = new URLSearchParams();
    body.append("client_id", this.clientId);
    body.append("scope", this.scopes);
    body.append("code", code);
    body.append("redirect_uri", this.redirectUri);
    body.append("grant_type", "authorization_code");
    body.append("code_verifier", codeVerifier);
    body.append("client_secret", this.clientSecret);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Microsoft OAuth token exchange failed: ${response.status.toString()} ${response.statusText} - ${errorText}`,
      );
    }

    const tokens: MicrosoftTokenResponse = await response.json();
    return tokens;
  }

  /**
   * Refresh access token using refresh_token.
   */
  public async refreshAccessToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
    const url = new URL(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`);

    const body = new URLSearchParams();
    body.append("client_id", this.clientId);
    body.append("client_secret", this.clientSecret);
    body.append("refresh_token", refreshToken);
    body.append("grant_type", "refresh_token");
    body.append("scope", this.scopes);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Microsoft OAuth token refresh failed: ${response.status.toString()} ${response.statusText} - ${errorText}`,
      );
    }

    const tokens: MicrosoftTokenResponse = await response.json();
    return tokens;
  }

  /**
   * Parse and validate an ID token (JWT).
   * Returns the claims payload without cryptographic verification (rely on HTTPS for transport security).
   * In production, consider verifying the signature using Microsoft's public keys.
   */
  public parseIdToken(idToken: string): AuthenticatedUser {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid ID token format");
    }

    const payload = Buffer.from(parts[1] ?? "", "base64url").toString("utf-8");
    const claims = JSON.parse(payload) as Record<string, unknown>;

    const { sub, email, name } = claims;
    const preferredUsername = claims["preferred_username"];

    if (typeof sub !== "string" || typeof email !== "string") {
      throw new Error("Missing required claims in ID token");
    }

    return {
      sub,
      email,
      name: typeof name === "string" ? name : email,
      preferredUsername: typeof preferredUsername === "string" ? preferredUsername : undefined,
    };
  }
}
