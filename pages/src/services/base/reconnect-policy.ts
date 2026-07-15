export const RECONNECT_BASE_DELAY_MS = 2_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_JITTER_RATIO = 0.2;

export function getReconnectDelayMs(attempt: number): number {
  const exponentialDelay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
  const jitter = exponentialDelay * RECONNECT_JITTER_RATIO * Math.random();

  return Math.round(exponentialDelay + jitter);
}
