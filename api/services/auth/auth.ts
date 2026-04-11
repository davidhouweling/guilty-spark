import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { addSeconds } from "date-fns";
import type { MicrosoftAuthService } from "./microsoft-auth";
import { SessionManager } from "./session-manager";
import type { PKCEState, SessionTokenPayload, AuthSession, AuthCallbackResult } from "./types";

export interface AuthServiceOpts {
  microsoftAuthService: MicrosoftAuthService;
  sessionSecret: string;
  pkceStore?: KVNamespace;
}

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
  private readonly pkceStore: KVNamespace | undefined;
  private readonly pkceStateStore: Map<string, PKCEState>; // In-memory for local dev; use KV for production

  public constructor({ microsoftAuthService, sessionSecret, pkceStore }: AuthServiceOpts) {
    this.microsoftAuth = Preconditions.checkExists(microsoftAuthService, "microsoftAuthService");

    this.sessionManager = new SessionManager(Preconditions.checkExists(sessionSecret, "sessionSecret"));

    this.pkceStore = pkceStore;

    this.pkceStateStore = new Map();
  }

  private getPkceStateKey(state: string): string {
    return `oauth:pkce:${state}`;
  }

  private async storePkceState(state: string, pkceState: PKCEState): Promise<void> {
    if (this.pkceStore != null) {
      await this.pkceStore.put(this.getPkceStateKey(state), JSON.stringify(pkceState), {
        expirationTtl: 10 * 60,
      });
      return;
    }

    this.pkceStateStore.set(state, pkceState);
  }

  private async loadPkceState(state: string): Promise<PKCEState | null> {
    if (this.pkceStore != null) {
      const storedValue = await this.pkceStore.get(this.getPkceStateKey(state));
      if (storedValue == null) {
        return null;
      }

      const parsed = JSON.parse(storedValue) as PKCEState;
      return parsed;
    }

    return this.pkceStateStore.get(state) ?? null;
  }

  private async deletePkceState(state: string): Promise<void> {
    if (this.pkceStore != null) {
      await this.pkceStore.delete(this.getPkceStateKey(state));
      return;
    }

    this.pkceStateStore.delete(state);
  }

  /**
   * Generate authorization URL for user login.
   * Returns the URL and a state parameter to verify in the callback.
   */
  public async generateAuthorizationUrl(
    redirectTo?: string,
  ): Promise<{ url: URL; state: string; codeVerifier: string }> {
    const { codeVerifier, codeChallenge } = await this.microsoftAuth.generatePKCE();
    const state = this.microsoftAuth.generateState();
    const safeRedirectTo = normalizeRedirectPath(redirectTo);

    // Store PKCE state for verification in callback
    const pkceState: PKCEState = {
      codeVerifier,
      codeChallenge,
      state,
      issuedAt: Date.now(),
      redirectTo: safeRedirectTo,
    };

    await this.storePkceState(state, pkceState);

    const url = this.microsoftAuth.getAuthorizationUrl(codeChallenge, state);

    return { url, state, codeVerifier };
  }

  /**
   * Handle OAuth callback: verify state, exchange code for tokens, create session.
   */
  public async handleCallback(code: string, state: string): Promise<AuthCallbackResult> {
    // Verify state and retrieve PKCE verifier
    const pkceState = await this.loadPkceState(state);
    if (!pkceState) {
      throw new Error("Invalid or expired state parameter");
    }

    // Clean up state (use once)
    await this.deletePkceState(state);

    // Check if state is still fresh (within 10 minutes)
    const stateAgeMs = Date.now() - pkceState.issuedAt;
    if (stateAgeMs > 10 * 60 * 1000) {
      throw new Error("State parameter expired (>10 minutes)");
    }

    // Exchange code for tokens
    const tokens = await this.microsoftAuth.exchangeCodeForTokens(code, pkceState.codeVerifier);

    // Parse ID token to get user info
    const user = this.microsoftAuth.parseIdToken(tokens.id_token ?? "");

    // Create session token
    const issuedAt = Date.now();
    const expiresAt = addSeconds(new Date(issuedAt), tokens.expires_in).getTime();
    const sessionPayload: SessionTokenPayload = {
      userId: user.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      issuedAt,
    };

    return {
      sessionPayload,
      redirectTo: pkceState.redirectTo,
    };
  }

  /**
   * Create a signed session token and return it (caller handles cookie setting).
   */
  public async createSessionToken(payload: SessionTokenPayload): Promise<string> {
    return this.sessionManager.createSessionToken(payload);
  }

  /**
   * Validate a session token from a request.
   */
  public async validateSession(request: Request): Promise<AuthSession | null> {
    const token = this.sessionManager.extractSessionToken(request);
    if (token == null) {
      return null;
    }

    return this.sessionManager.validateSessionToken(token);
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

    const issuedAt = Date.now();

    return {
      userId: session.userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: addSeconds(new Date(issuedAt), tokens.expires_in).getTime(),
      issuedAt,
      ...(session.avatarUrl != null ? { avatarUrl: session.avatarUrl } : {}),
    };
  }

  /**
   * Set session cookie in response.
   */
  public setSessionCookie(response: Response, token: string, expiresAt: number): void {
    this.sessionManager.setSessionCookie(response, token, expiresAt);
  }

  /**
   * Clear session cookie from response.
   */
  public clearSessionCookie(response: Response): void {
    this.sessionManager.clearSessionCookie(response);
  }
}
