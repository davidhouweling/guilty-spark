export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

function getCallerSignal(input: RequestInfo | URL, init: RequestInit | undefined): AbortSignal | null {
  if (init?.signal != null) {
    return init.signal;
  }

  return input instanceof Request ? input.signal : null;
}

export function withTimeoutSignal(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const callerSignal = getCallerSignal(input, init);
  const signal = callerSignal != null ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

  return { ...init, signal };
}

export function createTimeoutFetch(fetchFn: typeof fetch, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): typeof fetch {
  return async (input, init) => fetchFn(input, withTimeoutSignal(input, init, timeoutMs));
}
