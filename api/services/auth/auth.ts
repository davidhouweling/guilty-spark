import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { MicrosoftAuthService } from "./microsoft-auth";
import { SessionManager } from "./session-manager";
import type { PKCEState, SessionTokenPayload, AuthSession } from "./types";

/**
 * Main authentication orchestrator.
 * Coordinates Microsoft OAuth, PKCE, and session management.
 */
export class AuthService {
  private readonly microsoftAuth: MicrosoftAuthService;
  private readonly sessionManager: SessionManager;
  private readonly pkceStateStore: Map<string, PKCEState>; // In-memory for local dev; use KV for production

  public constructor(config: {
    microsoftClientId: string;
    microsoftClientSecret: string;
    microsoftRedirectUri: string;
    sessionSecret: string;
    tenant?: string;
  }) {
    this.microsoftAuth = new MicrosoftAuthService({
      clientId: Preconditions.checkExists(config.microsoftClientId, "microsoftClientId"),
      clientSecret: Preconditions.checkExists(config.microsoftClientSecret, "microsoftClientSecret"),
      redirectUri: Preconditions.checkExists(config.microsoftRedirectUri, "microsoftRedirectUri"),
      tenant: config.tenant,
    });

    this.sessionManager = new SessionManager(Preconditions.checkExists(config.sessionSecret, "sessionSecret"));

    this.pkceStateStore = new Map();
  }

  /**
   * Generate authorization URL for user login.
   * Returns the URL and a state parameter to verify in the callback.
   */
  public async generateAuthorizationUrl(): Promise<{ url: URL; state: string; codeVerifier: string }> {
    const { codeVerifier, codeChallenge } = await this.microsoftAuth.generatePKCE();
    const state = this.microsoftAuth.generateState();

    // Store PKCE state for verification in callback
    const pkceState: PKCEState = {
      codeVerifier,
      codeChallenge,
      state,
      issuedAt: Date.now(),
    };

    this.pkceStateStore.set(state, pkceState);

    const url = this.microsoftAuth.getAuthorizationUrl(codeChallenge, state);

    return { url, state, codeVerifier };
  }

  /**
   * Handle OAuth callback: verify state, exchange code for tokens, create session.
   */
  public async handleCallback(code: string, state: string): Promise<SessionTokenPayload> {
    // Verify state and retrieve PKCE verifier
    const pkceState = this.pkceStateStore.get(state);
    if (!pkceState) {
      throw new Error("Invalid or expired state parameter");
    }

    // Clean up state (use once)
    this.pkceStateStore.delete(state);

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
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    const sessionPayload: SessionTokenPayload = {
      userId: user.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      issuedAt: Date.now(),
    };

    return sessionPayload;
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
