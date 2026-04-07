import type { SessionTokenPayload, AuthenticatedUser, PKCEState } from "../types";

/**
 * Fake authenticated user for tests.
 */
export function aFakeAuthenticatedUser(): AuthenticatedUser {
  return {
    sub: "user-123",
    email: "user@example.com",
    name: "Test User",
    preferredUsername: "testuser",
  };
}

/**
 * Fake session token payload for tests.
 */
export function aFakeSessionTokenPayload(overrides?: Partial<SessionTokenPayload>): SessionTokenPayload {
  return {
    userId: "user-123",
    accessToken: "access-token-value",
    refreshToken: "refresh-token-value",
    expiresAt: Date.now() + 3600 * 1000,
    issuedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Fake PKCE state for tests.
 */
export function aFakePKCEState(overrides?: Partial<PKCEState>): PKCEState {
  return {
    codeVerifier: "code_verifier_abcdefghijklmnopqrstuvwxyz1234567890",
    codeChallenge: "code_challenge_base64url_encoded",
    state: "state_xyz123",
    issuedAt: Date.now(),
    ...overrides,
  };
}
