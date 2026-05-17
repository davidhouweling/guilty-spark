import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MicrosoftTokenResponse, AuthenticatedUser, PKCEState } from "./types";

interface JwtHeader {
  readonly alg: string;
  readonly kid: string;
}

interface IdTokenClaims {
  readonly aud: string | readonly string[];
  readonly email: string;
  readonly exp: number;
  readonly iss: string;
  readonly name: string | undefined;
  readonly nbf: number | undefined;
  readonly preferred_username: string | undefined;
  readonly sub: string;
  readonly tid: string | undefined;
}

interface OpenIdConfiguration {
  readonly issuer: string;
  readonly jwks_uri: string;
}

interface CachedValue<T> {
  readonly expiresAt: number;
  readonly value: T;
}

interface SigningJsonWebKey extends JsonWebKey {
  readonly e: string;
  readonly kid?: string;
  readonly kty: string;
  readonly n: string;
  readonly use?: string;
}

interface JwkSet {
  readonly keys: readonly SigningJsonWebKey[];
}

/**
 * Microsoft OAuth2 with PKCE (Proof Key for Code Exchange) implementation.
 * Suitable for browser-based auth flow.
 */
export class MicrosoftAuthService {
  private static readonly DEFAULT_CACHE_MAX_AGE_SECONDS = 300;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tenant: string; // 'consumers' for personal accounts
  private readonly scopes: string;
  private openIdConfigurationCache: CachedValue<OpenIdConfiguration> | null = null;
  private jwkSetCache: CachedValue<JwkSet> | null = null;

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
    this.scopes = config.scopes ?? "openid email offline_access XboxLive.signin XboxLive.offline_access";
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
   */
  public async parseIdToken(idToken: string): Promise<AuthenticatedUser> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid ID token format");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (
      typeof encodedHeader !== "string" ||
      encodedHeader === "" ||
      typeof encodedPayload !== "string" ||
      encodedPayload === "" ||
      typeof encodedSignature !== "string" ||
      encodedSignature === ""
    ) {
      throw new Error("Invalid ID token format");
    }

    const header = this.parseJwtHeader(encodedHeader);
    const claims = this.parseClaims(encodedPayload);
    const openIdConfiguration = await this.getOpenIdConfiguration();

    await this.verifySignature(encodedHeader, encodedPayload, encodedSignature, header.kid);
    this.validateClaims(claims, openIdConfiguration.issuer);

    return {
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? claims.email,
      preferredUsername: claims.preferred_username,
    };
  }

  private parseJwtHeader(encodedHeader: string): JwtHeader {
    const header = this.parseJsonObject(encodedHeader, "header");
    const { alg, kid } = header;

    if (alg !== "RS256" || typeof kid !== "string" || kid === "") {
      throw new Error("Invalid ID token header");
    }

    return {
      alg,
      kid,
    };
  }

  private parseClaims(encodedPayload: string): IdTokenClaims {
    const claims = this.parseJsonObject(encodedPayload, "payload");
    const { aud, email, exp, iss, name, nbf, preferred_username: preferredUsername, sub, tid } = claims;

    if (
      typeof sub !== "string" ||
      typeof email !== "string" ||
      (typeof name !== "string" && name !== undefined) ||
      (typeof preferredUsername !== "string" && preferredUsername !== undefined) ||
      (typeof aud !== "string" && !this.isStringArray(aud)) ||
      typeof exp !== "number" ||
      typeof iss !== "string" ||
      (typeof tid !== "string" && tid !== undefined) ||
      (typeof nbf !== "number" && nbf !== undefined)
    ) {
      throw new Error("Missing required claims in ID token");
    }

    return {
      sub,
      email,
      name,
      preferred_username: preferredUsername,
      aud,
      exp,
      iss,
      tid,
      nbf,
    };
  }

  private async verifySignature(
    encodedHeader: string,
    encodedPayload: string,
    encodedSignature: string,
    keyId: string,
  ): Promise<void> {
    const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signature = Buffer.from(encodedSignature, "base64url");
    const key = await this.getVerificationKey(keyId);
    const isValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);

    if (!isValid) {
      throw new Error("Invalid ID token signature");
    }
  }

  private validateClaims(claims: IdTokenClaims, issuerTemplate: string): void {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (claims.exp <= nowSeconds) {
      throw new Error("ID token expired");
    }

    if (claims.nbf !== undefined && claims.nbf > nowSeconds) {
      throw new Error("ID token is not valid yet");
    }

    if (!this.matchesAudience(claims.aud)) {
      throw new Error("Invalid ID token audience");
    }

    if (!this.matchesIssuer(claims, issuerTemplate)) {
      throw new Error("Invalid ID token issuer");
    }
  }

  private matchesAudience(audience: IdTokenClaims["aud"]): boolean {
    if (typeof audience === "string") {
      return audience === this.clientId;
    }

    return audience.includes(this.clientId);
  }

  private matchesIssuer(claims: IdTokenClaims, issuerTemplate: string): boolean {
    const allowedIssuers = new Set<string>();
    if (issuerTemplate.includes("{tenantid}")) {
      if (claims.tid !== undefined) {
        allowedIssuers.add(issuerTemplate.replace("{tenantid}", claims.tid));
      }

      if (this.tenant === "common" || this.tenant === "consumers") {
        allowedIssuers.add(issuerTemplate.replace("{tenantid}", "consumers"));
      }
    } else {
      allowedIssuers.add(issuerTemplate);
    }

    if (this.isSpecificTenantGuid(this.tenant) && claims.tid !== this.tenant) {
      return false;
    }

    return allowedIssuers.has(claims.iss);
  }

  private isSpecificTenantGuid(tenant: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant);
  }

  private async getOpenIdConfiguration(forceRefresh = false): Promise<OpenIdConfiguration> {
    if (!forceRefresh && this.openIdConfigurationCache != null && this.openIdConfigurationCache.expiresAt > Date.now()) {
      return this.openIdConfigurationCache.value;
    }

    const configuration = await this.fetchOpenIdConfiguration();
    this.openIdConfigurationCache = configuration;
    return configuration.value;
  }

  private async fetchOpenIdConfiguration(): Promise<CachedValue<OpenIdConfiguration>> {
    const response = await fetch(
      new URL(`https://login.microsoftonline.com/${this.tenant}/v2.0/.well-known/openid-configuration`),
    );

    if (!response.ok) {
      throw new Error(
        `Microsoft OpenID configuration fetch failed: ${response.status.toString()} ${response.statusText}`,
      );
    }

    const payload: unknown = await response.json();
    if (!this.isOpenIdConfiguration(payload)) {
      throw new Error("Invalid Microsoft OpenID configuration response");
    }

    return {
      expiresAt: this.getCacheExpiry(response.headers),
      value: payload,
    };
  }

  private async getVerificationKey(keyId: string): Promise<CryptoKey> {
    const jwk = await this.findVerificationKey(keyId);

    if (jwk == null) {
      throw new Error("Unable to find Microsoft signing key");
    }

    return await crypto.subtle.importKey(
      "jwk",
      {
        alg: "RS256",
        e: jwk.e,
        ext: true,
        key_ops: ["verify"],
        kty: jwk.kty,
        n: jwk.n,
      },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }

  private async findVerificationKey(keyId: string): Promise<SigningJsonWebKey | undefined> {
    const cachedJwkSet = await this.getJwkSet();
    const cachedKey = cachedJwkSet.keys.find((candidate) => {
      return candidate.kid === keyId && candidate.kty === "RSA";
    });
    if (cachedKey != null) {
      return cachedKey;
    }

    const refreshedJwkSet = await this.getJwkSet(true);
    return refreshedJwkSet.keys.find((candidate) => {
      return candidate.kid === keyId && candidate.kty === "RSA";
    });
  }

  private async getJwkSet(forceRefresh = false): Promise<JwkSet> {
    if (!forceRefresh && this.jwkSetCache != null && this.jwkSetCache.expiresAt > Date.now()) {
      return this.jwkSetCache.value;
    }

    const jwkSet = await this.fetchJwkSet(forceRefresh);
    this.jwkSetCache = jwkSet;
    return jwkSet.value;
  }

  private async fetchJwkSet(forceRefresh = false): Promise<CachedValue<JwkSet>> {
    const openIdConfiguration = await this.getOpenIdConfiguration(forceRefresh);
    const response = await fetch(new URL(openIdConfiguration.jwks_uri));

    if (!response.ok) {
      throw new Error(`Microsoft JWKS fetch failed: ${response.status.toString()} ${response.statusText}`);
    }

    const payload: unknown = await response.json();
    if (!this.isJwkSet(payload)) {
      throw new Error("Invalid Microsoft JWKS response");
    }

    return {
      expiresAt: this.getCacheExpiry(response.headers),
      value: payload,
    };
  }

  private parseJsonObject(encodedValue: string, context: "header" | "payload"): Record<string, unknown> {
    const decoded = Buffer.from(encodedValue, "base64url").toString("utf-8");
    const payload: unknown = JSON.parse(decoded);

    if (!this.isRecord(payload)) {
      throw new Error(`Invalid ID token ${context}`);
    }

    return payload;
  }

  private isOpenIdConfiguration(value: unknown): value is OpenIdConfiguration {
    return this.isRecord(value) && typeof value["issuer"] === "string" && typeof value["jwks_uri"] === "string";
  }

  private isJwkSet(value: unknown): value is JwkSet {
    return this.isRecord(value) && Array.isArray(value["keys"]);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }

  private getCacheExpiry(headers: Headers): number {
    const cacheControl = headers.get("cache-control");
    const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
    const maxAgeSeconds =
      maxAgeMatch?.[1] == null
        ? MicrosoftAuthService.DEFAULT_CACHE_MAX_AGE_SECONDS
        : Number.parseInt(maxAgeMatch[1], 10);

    return Date.now() + maxAgeSeconds * 1000;
  }
}
