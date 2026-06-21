/**
 * Microsoft OAuth token response from token endpoint.
 * Returned after successful code exchange.
 */
export interface MicrosoftTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  scope: string;
}

/**
 * User information extracted from Microsoft ID token or info endpoint.
 */
export interface AuthenticatedUser {
  readonly sub: string; // Microsoft user ID (immutable)
  readonly email: string | undefined;
  readonly name: string;
  readonly preferredUsername: string | undefined;
}

/**
 * Server-side session payload used while creating and refreshing sessions.
 * Only the signed sessionId is stored in the browser cookie; OAuth tokens remain in D1.
 */
export interface SessionTokenPayload {
  readonly sessionId: string;
  readonly userId: string; // Microsoft user ID
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly expiresAt: number; // Unix timestamp in milliseconds
  readonly issuedAt: number; // Unix timestamp in milliseconds
}

export interface SessionCookiePayload {
  readonly sessionId: string;
  readonly sessionExpiresAt: number; // Unix timestamp in milliseconds
}

/**
 * Authenticated session data (after validation).
 * Available to authenticated route handlers.
 */
export interface AuthSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly expiresAt: number;
  readonly isExpired: boolean;
  readonly avatarUrl?: string;
  readonly xboxGamertag?: string;
  readonly xboxXuid?: string;
  readonly xboxProfileCheckedAt?: number;
}

export interface AuthMetadata {
  readonly email?: string;
  readonly name?: string;
  readonly preferredUsername?: string;
  readonly avatarUrl?: string;
  readonly xboxGamertag?: string;
  readonly xboxXuid?: string;
  readonly xboxProfileCheckedAt?: number;
  readonly haloXstsTokenEncrypted?: string;
  readonly haloXstsUserHash?: string;
  readonly haloXstsExpiresAt?: number;
}

export interface SessionWithAuthMetadata {
  readonly session: AuthSession;
  readonly authMetadata: AuthMetadata;
}

export type XboxSessionProfile = Pick<AuthMetadata, "avatarUrl" | "xboxGamertag" | "xboxXuid" | "xboxProfileCheckedAt">;

/**
 * PKCE state: code_verifier for securing auth flow.
 * Stored temporarily (in development: in memory; in production: in KV or session).
 */
export interface PKCEState {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly state: string;
  readonly issuedAt: number;
  readonly redirectTo: string;
}

export interface AuthCallbackResult {
  readonly sessionPayload: SessionTokenPayload;
  readonly redirectTo: string;
}
