export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export function withTimeoutSignal(init: RequestInit | undefined, timeoutMs: number): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal != null ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

  return { ...init, signal };
}

export function createTimeoutFetch(fetchFn: typeof fetch, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): typeof fetch {
  return async (input, init) => fetchFn(input, withTimeoutSignal(init, timeoutMs));
}
