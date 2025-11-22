import type { IPlayerMatchesRateLimiter } from "../player-matches-rate-limiter.mjs";

/**
 * Fake rate limiter that executes immediately without delays.
 * Used for testing to avoid timing issues with fake timers.
 */
export class FakePlayerMatchesRateLimiter implements IPlayerMatchesRateLimiter {
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export function aFakePlayerMatchesRateLimiterWith(): IPlayerMatchesRateLimiter {
  return new FakePlayerMatchesRateLimiter();
}
