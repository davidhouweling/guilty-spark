import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { DatabaseService } from "../database/database";
import type { UserSessionsRow } from "../database/types/user_sessions";
import { MicrosoftAuthService } from "./microsoft-auth";
import { SessionManager, SESSION_COOKIE_MAX_AGE_SECONDS } from "./session-manager";
import { TokenEncryptor } from "./token-encryptor";
import type { PKCEState, SessionTokenPayload, AuthSession, SessionCookiePayload, AuthCallbackResult } from "./types";

function normalizeRedirectPath(redirectTo?: string): string {
  if (redirectTo == null || redirectTo === "") {
    return "/";
  }

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }

  return redirectTo;
}

/**
 * Main authentication orchestrator.
 * Coordinates Microsoft OAuth, PKCE, and session management.
 */
export class AuthService {
  private readonly microsoftAuth: MicrosoftAuthService;
  private readonly sessionManager: SessionManager;
  private readonly tokenEncryptor: TokenEncryptor;
  private readonly databaseService: DatabaseService;

  public constructor(config: {
    microsoftClientId: string;
    microsoftClientSecret: string;
    microsoftRedirectUri: string;
    microsoftTenant?: string;
    microsoftScopes?: string;
    sessionSecret: string;
    tokenEncryptionSecret: string;
    databaseService: DatabaseService;
  }) {
    this.microsoftAuth = new MicrosoftAuthService({
      clientId: Preconditions.checkExists(config.microsoftClientId, "microsoftClientId"),
      clientSecret: Preconditions.checkExists(config.microsoftClientSecret, "microsoftClientSecret"),
      redirectUri: Preconditions.checkExists(config.microsoftRedirectUri, "microsoftRedirectUri"),
      tenant: config.microsoftTenant,
      scopes: config.microsoftScopes,
    });

    this.sessionManager = new SessionManager(Preconditions.checkExists(config.sessionSecret, "sessionSecret"));
    this.tokenEncryptor = new TokenEncryptor(
      Preconditions.checkExists(config.tokenEncryptionSecret, "tokenEncryptionSecret"),
    );
    this.databaseService = Preconditions.checkExists(config.databaseService, "databaseService");
  }

  /**
   * Generate authorization URL for user login.
   * Returns the URL and a state parameter to verify in the callback.
   */
  public async generateAuthorizationUrl(): Promise<{ url: URL; state: string; codeVerifier: string }> {
    const { codeVerifier, codeChallenge } = await this.microsoftAuth.generatePKCE();
    const state = this.microsoftAuth.generateState();

    const url = this.microsoftAuth.getAuthorizationUrl(codeChallenge, state);

    return { url, state, codeVerifier };
  }

  /**
   * Handle OAuth callback: verify state, exchange code for tokens, create session.
   */
  public async handleCallback(request: Request, code: string, state: string): Promise<AuthCallbackResult> {
    const pkceState = await this.readPkceState(request, state);

    // Check if state is still fresh (within 10 minutes)
    const stateAgeMs = Date.now() - pkceState.issuedAt;
    if (stateAgeMs > 10 * 60 * 1000) {
      throw new Error("State parameter expired (>10 minutes)");
    }

    // Exchange code for tokens
    const tokens = await this.microsoftAuth.exchangeCodeForTokens(code, pkceState.codeVerifier);

    // Parse ID token to get user info
    const user = await this.microsoftAuth.parseIdToken(tokens.id_token ?? "");

    const sessionId = crypto.randomUUID();

    // Create session token
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    const sessionPayload: SessionTokenPayload = {
      sessionId,
      userId: user.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      issuedAt: Date.now(),
    };

    await this.persistSession(sessionPayload, user.email, user.name, user.preferredUsername);

    return {
      sessionPayload,
      redirectTo: pkceState.redirectTo,
    };
  }

  /**
   * Create a signed session token and return it (caller handles cookie setting).
   */
  public async createSessionToken(payload: SessionTokenPayload): Promise<string> {
    const sessionCookiePayload: SessionCookiePayload = {
      sessionId: payload.sessionId,
      sessionExpiresAt: payload.issuedAt + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
    };

    return this.sessionManager.createSignedToken(JSON.stringify(sessionCookiePayload));
  }

  /**
   * Validate a session token from a request.
   */
  public async validateSession(request: Request): Promise<AuthSession | null> {
    const token = this.sessionManager.extractSessionToken(request);
    if (token == null) {
      return null;
    }

    const sessionCookiePayload = await this.readSessionCookiePayload(token);
    if (sessionCookiePayload == null || sessionCookiePayload.sessionExpiresAt <= Date.now()) {
      return null;
    }

    const session = await this.databaseService.getUserSession(sessionCookiePayload.sessionId);
    if (session == null) {
      return null;
    }

    return await this.toAuthSession(session);
  }

  public async invalidateSession(request: Request): Promise<void> {
    const session = await this.validateSession(request);
    if (session == null) {
      return;
    }

    await this.databaseService.deleteUserSession(session.sessionId);
  }

  /**
   * Refresh an expired session using the stored refresh token.
   * Returns null when no refresh token is available.
   */
  public async refreshSession(session: AuthSession): Promise<SessionTokenPayload | null> {
    if (session.refreshToken == null) {
      return null;
    }

    const tokens = await this.microsoftAuth.refreshAccessToken(session.refreshToken);
    const existingSession = await this.databaseService.getUserSession(session.sessionId);
    if (existingSession == null) {
      return null;
    }

    const now = Date.now();
    const refreshedSession: SessionTokenPayload = {
      sessionId: session.sessionId,
      userId: session.userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: now + tokens.expires_in * 1000,
      issuedAt: now,
    };

    await this.databaseService.upsertUserSession({
      ...existingSession,
      AccessToken: await this.tokenEncryptor.encrypt(refreshedSession.accessToken),
      RefreshToken:
        refreshedSession.refreshToken == null ? null : await this.tokenEncryptor.encrypt(refreshedSession.refreshToken),
      ExpiresAt: Math.floor(refreshedSession.expiresAt / 1000),
      LastRefreshedAt: Math.floor(now / 1000),
    });

    return refreshedSession;
  }

  /**
   * Set session cookie in response.
   */
  public setSessionCookie(response: Response, token: string): void {
    this.sessionManager.setSessionCookie(response, token);
  }

  /**
   * Clear session cookie from response.
   */
  public clearSessionCookie(response: Response): void {
    this.sessionManager.clearSessionCookie(response);
  }

  public async setPkceStateCookie(
    response: Response,
    pkceState: Pick<PKCEState, "codeVerifier" | "state" | "issuedAt" | "redirectTo">,
  ): Promise<void> {
    const token = JSON.stringify({
      ...pkceState,
      redirectTo: normalizeRedirectPath(pkceState.redirectTo),
    });
    const signedToken = await this.sessionManager.createSignedToken(token);
    this.sessionManager.setPkceStateCookie(response, signedToken);
  }

  public clearPkceStateCookie(response: Response): void {
    this.sessionManager.clearPkceStateCookie(response);
  }

  private async readPkceState(
    request: Request,
    state: string,
  ): Promise<Pick<PKCEState, "codeVerifier" | "state" | "issuedAt" | "redirectTo">> {
    const token = this.sessionManager.extractPkceStateToken(request);
    if (token == null) {
      throw new Error("Invalid or expired state parameter");
    }

    const payload = await this.sessionManager.validateSignedToken(token);
    if (payload == null) {
      throw new Error("Invalid or expired state parameter");
    }

    const pkceState = this.parsePkceStatePayload(JSON.parse(payload));
    if (pkceState == null) {
      throw new Error("Invalid or expired state parameter");
    }
    if (pkceState.state !== state) {
      throw new Error("Invalid or expired state parameter");
    }

    return pkceState;
  }

  private async persistSession(
    payload: SessionTokenPayload,
    email?: string,
    name?: string,
    preferredUsername?: string,
  ): Promise<void> {
    const sessionRow: UserSessionsRow = {
      SessionId: payload.sessionId,
      UserId: payload.userId,
      AccessToken: await this.tokenEncryptor.encrypt(payload.accessToken),
      RefreshToken: payload.refreshToken == null ? null : await this.tokenEncryptor.encrypt(payload.refreshToken),
      ExpiresAt: Math.floor(payload.expiresAt / 1000),
      CreatedAt: Math.floor(payload.issuedAt / 1000),
      LastRefreshedAt: Math.floor(payload.issuedAt / 1000),
      AuthMetadataJson: JSON.stringify({
        email,
        name,
        preferredUsername,
      }),
    };

    await this.databaseService.upsertUserSession(sessionRow);
  }

  private async toAuthSession(session: UserSessionsRow): Promise<AuthSession> {
    const expiresAt = session.ExpiresAt * 1000;
    const isExpired = expiresAt < Date.now();
    const accessToken = await this.tokenEncryptor.decrypt(session.AccessToken);
    const refreshToken =
      session.RefreshToken == null ? undefined : await this.tokenEncryptor.decrypt(session.RefreshToken);

    return {
      sessionId: session.SessionId,
      userId: session.UserId,
      accessToken,
      refreshToken,
      expiresAt,
      isExpired,
    };
  }

  private async readSessionCookiePayload(token: string): Promise<SessionCookiePayload | null> {
    const payload = await this.sessionManager.validateSignedToken(token);
    if (payload == null) {
      return null;
    }

    try {
      const sessionCookiePayload = this.parseSessionCookiePayload(JSON.parse(payload));
      if (sessionCookiePayload == null) {
        return null;
      }

      return sessionCookiePayload;
    } catch {
      return null;
    }
  }

  private parseSessionCookiePayload(value: unknown): SessionCookiePayload | null {
    if (
      typeof value === "object" &&
      value !== null &&
      "sessionId" in value &&
      typeof value.sessionId === "string" &&
      value.sessionId !== "" &&
      "sessionExpiresAt" in value &&
      typeof value.sessionExpiresAt === "number" &&
      Number.isFinite(value.sessionExpiresAt)
    ) {
      return {
        sessionId: value.sessionId,
        sessionExpiresAt: value.sessionExpiresAt,
      };
    }

    return null;
  }

  private parsePkceStatePayload(
    value: unknown,
  ): Pick<PKCEState, "codeVerifier" | "state" | "issuedAt" | "redirectTo"> | null {
    if (
      typeof value === "object" &&
      value !== null &&
      "codeVerifier" in value &&
      typeof value.codeVerifier === "string" &&
      value.codeVerifier !== "" &&
      "state" in value &&
      typeof value.state === "string" &&
      value.state !== "" &&
      "issuedAt" in value &&
      typeof value.issuedAt === "number" &&
      Number.isFinite(value.issuedAt) &&
      "redirectTo" in value &&
      typeof value.redirectTo === "string"
    ) {
      return {
        codeVerifier: value.codeVerifier,
        state: value.state,
        issuedAt: value.issuedAt,
        redirectTo: normalizeRedirectPath(value.redirectTo),
      };
    }

    return null;
  }
}
