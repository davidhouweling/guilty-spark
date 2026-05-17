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
  readonly email: string;
  readonly name: string;
  readonly preferredUsername: string | undefined;
}

/**
 * Session token payload (what gets stored in cookie).
 * Compact representation to fit within typical cookie size limits.
 */
export interface SessionTokenPayload {
  readonly userId: string; // Microsoft user ID
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly expiresAt: number; // Unix timestamp in milliseconds
  readonly issuedAt: number; // Unix timestamp in milliseconds
}

/**
 * Authenticated session data (after validation).
 * Available to authenticated route handlers.
 */
export interface AuthSession {
  readonly userId: string;
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly expiresAt: number;
  readonly isExpired: boolean;
}

/**
 * PKCE state: code_verifier for securing auth flow.
 * Stored temporarily (in development: in memory; in production: in KV or session).
 */
export interface PKCEState {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly state: string;
  readonly issuedAt: number;
}
