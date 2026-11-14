import type { LogService } from "../log/types";
import { DEFAULT_FETCH_TIMEOUT_MS, withTimeoutSignal } from "./fetch-timeout";
import {
  getKvCacheSkipReason,
  IMMUTABLE_RESPONSE_TTL_SECONDS,
  isImmutableHaloResource,
} from "./kv-response-cache-policy";

interface ResilientFetchOptions {
  env: Env;
  logService: LogService;
  kvKeyNamespace?: string;
  requestTimeoutMs?: number | undefined;
}

interface KvCachedResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

interface BufferedResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer;
}

async function bufferResponse(response: Promise<Response>): Promise<BufferedResponse> {
  const resolved = await response;
  return {
    status: resolved.status,
    statusText: resolved.statusText,
    headers: Array.from(resolved.headers.entries()),
    body: await resolved.arrayBuffer(),
  };
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function toResponse({ status, statusText, headers, body }: BufferedResponse): Response {
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body.slice(0), { status, statusText, headers });
}

function isGetRequest(init?: RequestInit): boolean {
  const method = init?.method ?? "GET";
  return method.toUpperCase() === "GET";
}

function isHaloWaypointUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "halowaypoint.com" || parsed.hostname.endsWith(".halowaypoint.com");
  } catch {
    return false;
  }
}

function parseCacheControlMaxAgeSeconds(headers: Headers): number | null {
  const cacheControl = headers.get("cache-control");
  if (cacheControl == null) {
    return null;
  }

  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (match == null) {
    return null;
  }

  const [, maxAgeValue] = match;
  if (maxAgeValue == null) {
    return null;
  }

  const parsed = Number.parseInt(maxAgeValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveResponseCacheTtlSeconds(url: string, headers: Headers): number {
  const fromHeaders = parseCacheControlMaxAgeSeconds(headers);
  if (fromHeaders != null) {
    return Math.min(Math.max(fromHeaders, 30), 604800);
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.includes("/matches/") || path.includes("/metadata")) {
      return 604800;
    }
    if (path.includes("/players/") && path.includes("/matches")) {
      return 60;
    }
    if (path.includes("/players/") && path.includes("servicerecord")) {
      return 60;
    }
    if (path.includes("/playlist") || path.includes("/csr")) {
      return 86400;
    }
    if (path.includes("/users")) {
      return 3600;
    }
  } catch {
    // Malformed URL should be effectively impossible here; use safe default.
  }

  return 3600;
}

/**
 * Batch profile lookups are keyed by their exact xuid combination, so they rarely hit.
 * HaloService caches each player individually instead.
 */
function isBatchUserLookupUrl(url: string): boolean {
  try {
    const { pathname, searchParams } = new URL(url);
    return pathname.toLowerCase() === "/users" && searchParams.has("xuids");
  } catch {
    return false;
  }
}

export function createResilientFetch({
  env,
  logService,
  kvKeyNamespace,
  requestTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}: ResilientFetchOptions): typeof fetch {
  const responseCacheKeyPrefix = kvKeyNamespace != null ? `${kvKeyNamespace}:responses` : "halo:responses";

  const inFlightRequests = new Map<string, Promise<BufferedResponse>>();

  function logCacheStatus(response: Response, url: string): void {
    const cacheStatus = response.headers.get("cf-cache-status");
    const age = response.headers.get("age");
    if (cacheStatus != null) {
      logService.debug(
        `Cache ${cacheStatus} for ${url}`,
        new Map<string, string>([
          ["cf-cache-status", cacheStatus],
          ["age", age ?? "N/A"],
        ]),
      );
    }
  }

  function buildResponseCacheKey(url: string): string {
    return `${responseCacheKeyPrefix}:${url}`;
  }

  function isKvResponseCacheableRequest(url: string, init?: RequestInit): boolean {
    return isGetRequest(init) && isHaloWaypointUrl(url) && !isBatchUserLookupUrl(url);
  }

  async function getKvCachedResponse(url: string, init?: RequestInit): Promise<Response | null> {
    if (!isKvResponseCacheableRequest(url, init)) {
      return null;
    }

    const cacheKey = buildResponseCacheKey(url);
    try {
      const cached = await env.APP_DATA.get<KvCachedResponse>(cacheKey, "json");
      if (cached == null) {
        return null;
      }

      const headers = new Headers(cached.headers);
      headers.set("x-gs-kv-cache", "HIT");
      logService.debug(`KV cache HIT for ${url}`);
      return new Response(cached.body, { status: cached.status, headers });
    } catch {
      return null;
    }
  }

  async function maybeCacheResponseInKv(url: string, init: RequestInit | undefined, response: Response): Promise<void> {
    if (!isKvResponseCacheableRequest(url, init)) {
      return;
    }

    const skipReason = getKvCacheSkipReason(url, response);
    if (skipReason != null) {
      logService.debug(`KV cache skip for ${url}`, new Map([["reason", skipReason]]));
      return;
    }

    try {
      const cacheKey = buildResponseCacheKey(url);
      const cloned = response.clone();
      const body = await cloned.text();
      const ttlSeconds = isImmutableHaloResource(url)
        ? IMMUTABLE_RESPONSE_TTL_SECONDS
        : resolveResponseCacheTtlSeconds(url, cloned.headers);
      const payload: KvCachedResponse = {
        status: cloned.status,
        headers: Array.from(cloned.headers.entries()),
        body,
      };

      await env.APP_DATA.put(cacheKey, JSON.stringify(payload), { expirationTtl: ttlSeconds });
      logService.debug(`KV cache store for ${url}`, new Map([["ttlSeconds", ttlSeconds.toString()]]));
    } catch {
      // KV write failure is best-effort; do not fail the request
    }
  }

  function getInFlightRequestKey(url: string, init: RequestInit): string {
    const headers = [...new Headers(init.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify([url, headers]);
  }

  async function shareInFlightRequest(
    url: string,
    init: RequestInit,
    load: () => Promise<Response>,
  ): Promise<Response> {
    const key = getInFlightRequestKey(url, init);
    const existing = inFlightRequests.get(key);
    if (existing != null) {
      logService.debug(`Sharing in-flight request for ${url}`);
      return toResponse(await existing);
    }

    const pending = bufferResponse(load());
    inFlightRequests.set(key, pending);
    try {
      return toResponse(await pending);
    } finally {
      inFlightRequests.delete(key);
    }
  }

  function isShareableRequest(input: RequestInfo | URL, url: string, init: RequestInit): boolean {
    return !(input instanceof Request) && init.signal == null && isKvResponseCacheableRequest(url, init);
  }

  async function fetchAndCache(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    url: string,
    cacheInit: RequestInit,
  ): Promise<Response> {
    const kvCachedResponse = await getKvCachedResponse(url, cacheInit);
    if (kvCachedResponse != null) {
      return kvCachedResponse;
    }

    function getRetryAfterMs(response: Response): number {
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter === null) {
        return 1000;
      }

      const parsedSeconds = Number.parseInt(retryAfter, 10);
      if (!Number.isNaN(parsedSeconds)) {
        return parsedSeconds * 1000;
      }

      const retryDate = new Date(retryAfter);
      if (!Number.isNaN(retryDate.getTime())) {
        return Math.max(0, retryDate.getTime() - Date.now());
      }

      return 1000;
    }

    async function fetchWithRetry(attempt = 1): Promise<Response> {
      const response = await fetch(input, withTimeoutSignal(input, init, requestTimeoutMs));

      logCacheStatus(response, url);

      if (response.status === 429) {
        const maxAttempts = 3;
        if (attempt >= maxAttempts) {
          logService.error(
            new Error(`Max retry attempts (${maxAttempts.toString()}) reached for ${url}`),
            new Map([["status", response.status.toString()]]),
          );
          return response;
        }

        const baseRetryMs = getRetryAfterMs(response);
        const retryMs = baseRetryMs * Math.pow(2, attempt - 1);

        logService.warn(
          `Rate limit 429 for ${url}, retrying in ${retryMs.toString()}ms (attempt ${attempt.toString()}/${maxAttempts.toString()})`,
        );

        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        return await fetchWithRetry(attempt + 1);
      }

      return response;
    }

    try {
      const response = await fetchWithRetry();
      await maybeCacheResponseInKv(url, cacheInit, response);
      return response;
    } catch (error) {
      logService.error(
        error,
        new Map([
          ["url", url],
          ["timeoutMs", requestTimeoutMs.toString()],
        ]),
      );
      throw error;
    }
  }

  return async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const cacheInit: RequestInit =
      input instanceof Request ? { ...init, method: init?.method ?? input.method } : { ...init };
    if (isShareableRequest(input, url, cacheInit)) {
      return shareInFlightRequest(url, cacheInit, async () => fetchAndCache(input, init, url, cacheInit));
    }
    return fetchAndCache(input, init, url, cacheInit);
  };
}
