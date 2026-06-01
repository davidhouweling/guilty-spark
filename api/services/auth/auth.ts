import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { safeRedirectPath } from "@guilty-spark/shared/base/safe-redirect";
import { z } from "zod";
import type { DatabaseService } from "../database/database";
import type { UserSessionsRow } from "../database/types/user_sessions";
import { MicrosoftAuthService } from "./microsoft-auth";
import { SessionManager, SESSION_COOKIE_MAX_AGE_SECONDS } from "./session-manager";
import { TokenEncryptor } from "./token-encryptor";
import type {
  PKCEState,
  SessionTokenPayload,
  AuthSession,
  SessionCookiePayload,
  AuthCallbackResult,
  AuthMetadata,
  XboxSessionProfile,
} from "./types";

const sessionCookiePayloadSchema = z.object({
  sessionId: z.string().min(1),
  sessionExpiresAt: z.number(),
});

const authMetadataSchema = z.object({
  email: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  preferredUsername: z.string().optional().catch(undefined),
  avatarUrl: z.string().optional().catch(undefined),
  xboxGamertag: z.string().optional().catch(undefined),
  xboxXuid: z.string().optional().catch(undefined),
  xboxProfileCheckedAt: z.number().optional().catch(undefined),
});

const pkceStatePayloadSchema = z.object({
  codeVerifier: z.string().min(1),
  state: z.string().min(1),
  issuedAt: z.number(),
  redirectTo: z.string(),
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function normalizeRedirectPath(redirectTo?: string): string {
  // The origin is only a yardstick for safeRedirectPath's same-origin check; any fixed value
  // works. The real redirect is resolved against env.PAGES_URL in the callback, and ".invalid"
  // is a reserved, never-resolving TLD, so it reads clearly as a sentinel.
  return safeRedirectPath(redirectTo, "https://placeholder.invalid");
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

    const stateAgeMs = Date.now() - pkceState.issuedAt;
    if (stateAgeMs > 10 * 60 * 1000) {
      throw new Error("State parameter expired (>10 minutes)");
    }

    const tokens = await this.microsoftAuth.exchangeCodeForTokens(code, pkceState.codeVerifier);
    const user = await this.microsoftAuth.parseIdToken(tokens.id_token ?? "");
    const sessionId = crypto.randomUUID();
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

  public async attachSessionProfile(sessionId: string, profile: XboxSessionProfile): Promise<void> {
    const existingSession = await this.databaseService.getUserSession(sessionId);
    if (existingSession == null) {
      return;
    }

    const mergedMetadata = this.parseAuthMetadata(existingSession.AuthMetadataJson);
    if (profile.avatarUrl != null) {
      mergedMetadata.avatarUrl = profile.avatarUrl;
    }
    if (profile.xboxGamertag != null) {
      mergedMetadata.xboxGamertag = profile.xboxGamertag;
    }
    if (profile.xboxXuid != null) {
      mergedMetadata.xboxXuid = profile.xboxXuid;
    }
    if (profile.xboxProfileCheckedAt != null) {
      mergedMetadata.xboxProfileCheckedAt = profile.xboxProfileCheckedAt;
    }

    await this.databaseService.updateSessionAuthMetadata(sessionId, JSON.stringify(mergedMetadata));

    if (profile.xboxXuid != null) {
      await this.linkXboxIdentity(existingSession.UserId, profile.xboxXuid, profile.xboxGamertag);
    }
  }

  private async linkXboxIdentity(userId: string, xuid: string, gamertag: string | undefined): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const identities = await this.databaseService.findLinkedIdentitiesByUserId(userId);

    for (const identity of identities) {
      if (identity.Provider === "xbox" && identity.IsActive === 1 && identity.ProviderUserId !== xuid) {
        await this.databaseService.upsertLinkedIdentity({ ...identity, IsActive: 0, UpdatedAt: nowEpoch });
      }
    }

    const existing = identities.find((identity) => identity.Provider === "xbox" && identity.ProviderUserId === xuid);

    await this.databaseService.upsertLinkedIdentity({
      IdentityId: existing?.IdentityId ?? crypto.randomUUID(),
      UserId: userId,
      Provider: "xbox",
      ProviderUserId: xuid,
      Gamertag: gamertag ?? existing?.Gamertag ?? null,
      TwitchId: existing?.TwitchId ?? null,
      IsActive: 1,
      CreatedAt: existing?.CreatedAt ?? nowEpoch,
      UpdatedAt: nowEpoch,
    });
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

    const encryptedRefreshToken =
      refreshedSession.refreshToken == null ? null : await this.tokenEncryptor.encrypt(refreshedSession.refreshToken);

    await this.databaseService.upsertUserSession({
      ...existingSession,
      AccessToken: await this.tokenEncryptor.encrypt(refreshedSession.accessToken),
      RefreshToken: encryptedRefreshToken,
      ExpiresAt: Math.floor(refreshedSession.expiresAt / 1000),
      LastRefreshedAt: Math.floor(now / 1000),
    });

    if (encryptedRefreshToken != null) {
      await this.databaseService.upsertUserCredentials({
        UserId: refreshedSession.userId,
        RefreshToken: encryptedRefreshToken,
        UpdatedAt: Math.floor(now / 1000),
      });
    }

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
    const authMetadata: Mutable<AuthMetadata> = {};
    if (email != null) {
      authMetadata.email = email;
    }
    if (name != null) {
      authMetadata.name = name;
    }
    if (preferredUsername != null) {
      authMetadata.preferredUsername = preferredUsername;
    }
    const encryptedRefreshToken =
      payload.refreshToken == null ? null : await this.tokenEncryptor.encrypt(payload.refreshToken);
    const sessionRow: UserSessionsRow = {
      SessionId: payload.sessionId,
      UserId: payload.userId,
      AccessToken: await this.tokenEncryptor.encrypt(payload.accessToken),
      RefreshToken: encryptedRefreshToken,
      ExpiresAt: Math.floor(payload.expiresAt / 1000),
      CreatedAt: Math.floor(payload.issuedAt / 1000),
      LastRefreshedAt: Math.floor(payload.issuedAt / 1000),
      AuthMetadataJson: JSON.stringify(authMetadata),
    };

    await this.databaseService.upsertUserSession(sessionRow);

    if (encryptedRefreshToken != null) {
      await this.databaseService.upsertUserCredentials({
        UserId: payload.userId,
        RefreshToken: encryptedRefreshToken,
        UpdatedAt: Math.floor(payload.issuedAt / 1000),
      });
    }
  }

  private parseAuthMetadata(authMetadataJson: string): z.infer<typeof authMetadataSchema> {
    try {
      const parsed = authMetadataSchema.safeParse(JSON.parse(authMetadataJson));
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  private async toAuthSession(session: UserSessionsRow): Promise<AuthSession> {
    const expiresAt = session.ExpiresAt * 1000;
    const isExpired = expiresAt < Date.now();
    const accessToken = await this.tokenEncryptor.decrypt(session.AccessToken);
    const refreshToken =
      session.RefreshToken == null ? undefined : await this.tokenEncryptor.decrypt(session.RefreshToken);
    const metadata = this.parseAuthMetadata(session.AuthMetadataJson);

    const authSession: Mutable<AuthSession> = {
      sessionId: session.SessionId,
      userId: session.UserId,
      accessToken,
      refreshToken,
      expiresAt,
      isExpired,
    };
    if (metadata.avatarUrl != null) {
      authSession.avatarUrl = metadata.avatarUrl;
    }
    if (metadata.xboxGamertag != null) {
      authSession.xboxGamertag = metadata.xboxGamertag;
    }
    if (metadata.xboxXuid != null) {
      authSession.xboxXuid = metadata.xboxXuid;
    }
    if (metadata.xboxProfileCheckedAt != null) {
      authSession.xboxProfileCheckedAt = metadata.xboxProfileCheckedAt;
    }
    return authSession;
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
    const parsedPayload = sessionCookiePayloadSchema.safeParse(value);

    return parsedPayload.success ? parsedPayload.data : null;
  }

  private parsePkceStatePayload(
    value: unknown,
  ): Pick<PKCEState, "codeVerifier" | "state" | "issuedAt" | "redirectTo"> | null {
    const parsed = pkceStatePayloadSchema.safeParse(value);

    return parsed.success
      ? {
          ...parsed.data,
          redirectTo: normalizeRedirectPath(parsed.data.redirectTo),
        }
      : null;
  }
}
