import { RequestError } from "halo-infinite-api";

/**
 * Halo surfaces auth failures either as a typed 401 or as an opaque message, so both are matched
 * here to keep token-refresh handling consistent across the tracker DO and API routes.
 */
export function isHaloAuthError(error: unknown): boolean {
  if (error instanceof RequestError) {
    return error.response.status === 401;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b|unauthorized|expired|spartan token/i.test(message);
}
