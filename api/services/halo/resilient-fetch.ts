import { addMilliseconds, differenceInSeconds } from "date-fns";
import type { LogService } from "../log/types";
import {
  type CircuitBreakerState,
  type ErrorWindow,
  type ProxyConfig,
  ProxyType,
  KV_KEYS,
  CIRCUIT_BREAKER_CONFIG,
  ISSUE_STATUS_CODES,
} from "./types";

interface ResilientFetchOptions {
  env: Env;
  logService: LogService;
  proxyUrl: string;
  kvKeyNamespace?: string;
}

interface DebounceEntry {
  timeout: NodeJS.Timeout;
  data: string;
}

interface KvCachedResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function detectProxyType(proxyUrl: string): ProxyType {
  if (!isValidUrl(proxyUrl)) {
    return ProxyType.NONE;
  }

  // HaloQuery-style proxy uses /proxy in the path (with or without trailing slash)
  if (proxyUrl.includes("/proxy")) {
    return ProxyType.URL_REWRITE;
  }

  // Default to JSON-RPC for backward compatibility
  return ProxyType.JSON_RPC;
}

function getErrorWindowKey(baseKey: string): string {
  const windowStart = Math.floor(Date.now() / CIRCUIT_BREAKER_CONFIG.ERROR_WINDOW_MS);
  return `${baseKey}:${windowStart.toString()}`;
}

function filterHeadersForProxy(headers: Headers): Headers {
  const proxiedHeaders = new Headers();
  const excludedHeaders = ["host", "content-length"];

  // Convert headers to array to iterate
  const headerArray = Array.from(headers as unknown as Iterable<[string, string]>);
  for (const [key, value] of headerArray) {
    if (!excludedHeaders.includes(key.toLowerCase())) {
      proxiedHeaders.set(key, value);
    }
  }

  return proxiedHeaders;
}

function transformUrlForProxy(originalUrl: string, proxyBaseUrl: string): string {
  const url = new URL(originalUrl);
  // Extract everything after the protocol and slashes
  // Example: https://halostats.svc.halowaypoint.com/hi/players/...
  // becomes: halostats.svc.halowaypoint.com/hi/players/...
  const pathWithDomain = `${url.host}${url.pathname}${url.search}`;

  // Ensure proxy base URL ends with /proxy/ or /proxy
  let proxyBase = proxyBaseUrl;
  if (!proxyBase.endsWith("/")) {
    proxyBase += "/";
  }

  return `${proxyBase}${pathWithDomain}`;
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

export function createResilientFetch({
  env,
  logService,
  proxyUrl,
  kvKeyNamespace,
}: ResilientFetchOptions): typeof fetch {
  const proxyConfig: ProxyConfig = {
    type: detectProxyType(proxyUrl),
    baseUrl: proxyUrl,
    enabled: isValidUrl(proxyUrl),
  };

  const circuitBreakerKey = kvKeyNamespace != null ? `${kvKeyNamespace}:circuit_breaker` : KV_KEYS.CIRCUIT_BREAKER;
  const errorWindowKey = kvKeyNamespace != null ? `${kvKeyNamespace}:errors` : KV_KEYS.ERROR_WINDOW;
  const responseCacheKeyPrefix = kvKeyNamespace != null ? `${kvKeyNamespace}:responses` : "halo:responses";

  const kvDebounceMap = new Map<string, DebounceEntry>();

  async function getMasterToggle(): Promise<boolean> {
    const value = await env.APP_DATA.get(KV_KEYS.PROXY_ENABLED);
    return value === "true";
  }

  async function getCircuitBreakerState(): Promise<CircuitBreakerState | null> {
    return await env.APP_DATA.get<CircuitBreakerState>(circuitBreakerKey, "json");
  }

  function logCacheStatus(response: Response, url: string, viaProxy = false): void {
    const cacheStatus = response.headers.get("cf-cache-status");
    const age = response.headers.get("age");
    if (cacheStatus != null) {
      const suffix = viaProxy ? " (via proxy)" : "";
      logService.debug(
        `Cache ${cacheStatus} for ${url}${suffix}`,
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
    return isGetRequest(init) && isHaloWaypointUrl(url);
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

  function isCacheControlPrivateOrNoStore(headers: Headers): boolean {
    const cacheControl = headers.get("cache-control");
    if (cacheControl == null) {
      return false;
    }
    const lower = cacheControl.toLowerCase();
    return lower.includes("no-store") || lower.includes("private");
  }

  async function maybeCacheResponseInKv(url: string, init: RequestInit | undefined, response: Response): Promise<void> {
    if (!isKvResponseCacheableRequest(url, init) || response.status !== 200) {
      return;
    }

    if (isCacheControlPrivateOrNoStore(response.headers)) {
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return;
    }

    try {
      const cacheKey = buildResponseCacheKey(url);
      const cloned = response.clone();
      const body = await cloned.text();
      const ttlSeconds = resolveResponseCacheTtlSeconds(url, cloned.headers);
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

  function scheduleKvWrite(key: string, data: string, ttlSeconds: number): void {
    const scheduleWrite = (dataToWrite: string): void => {
      const timeout = setTimeout(() => {
        void env.APP_DATA.put(key, dataToWrite, {
          expirationTtl: ttlSeconds,
        });
        kvDebounceMap.delete(key);
      }, 1000);

      kvDebounceMap.set(key, { timeout, data: dataToWrite });
    };

    const existing = kvDebounceMap.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.data = data;
      scheduleWrite(existing.data);
    } else {
      scheduleWrite(data);
    }
  }

  function activateCircuitBreaker(reason: string): void {
    const now = new Date();
    const expiresAt = addMilliseconds(now, CIRCUIT_BREAKER_CONFIG.CIRCUIT_BREAKER_DURATION_MS);

    const state: CircuitBreakerState = {
      activatedAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
      reason,
    };

    const ttlSeconds = differenceInSeconds(expiresAt, now);

    scheduleKvWrite(circuitBreakerKey, JSON.stringify(state), ttlSeconds);

    logService.warn(
      `Circuit breaker activated: ${reason}`,
      new Map<string, number | string>([
        ["activatedAt", state.activatedAt],
        ["expiresAt", state.expiresAt],
        ["reason", state.reason],
      ]),
    );
  }

  async function trackError(statusCode: number, url: string): Promise<void> {
    const windowKey = getErrorWindowKey(errorWindowKey);
    const now = Date.now();

    const existingWindow = await env.APP_DATA.get<ErrorWindow>(windowKey, "json");
    const errorWindow: ErrorWindow = existingWindow ?? {
      windowStart: Math.floor(now / CIRCUIT_BREAKER_CONFIG.ERROR_WINDOW_MS),
      errors: [],
    };

    errorWindow.errors.push({
      timestamp: now,
      statusCode,
      url,
    });

    const windowStartTime = errorWindow.windowStart * CIRCUIT_BREAKER_CONFIG.ERROR_WINDOW_MS;
    errorWindow.errors = errorWindow.errors.filter((error) => error.timestamp >= windowStartTime);

    scheduleKvWrite(windowKey, JSON.stringify(errorWindow), CIRCUIT_BREAKER_CONFIG.ERROR_TRACKING_TTL_SECONDS);

    logService.warn(
      `Rate limit error tracked: ${statusCode.toString()} for ${url}`,
      new Map<string, number>([
        ["errorCount", errorWindow.errors.length],
        ["threshold", CIRCUIT_BREAKER_CONFIG.ERROR_THRESHOLD],
      ]),
    );

    if (errorWindow.errors.length >= CIRCUIT_BREAKER_CONFIG.ERROR_THRESHOLD) {
      activateCircuitBreaker(
        `${errorWindow.errors.length.toString()} rate limit errors in ${(CIRCUIT_BREAKER_CONFIG.ERROR_WINDOW_MS / 60000).toString()} minutes`,
      );
    }
  }

  async function shouldUseProxy(): Promise<boolean> {
    if (!proxyConfig.enabled) {
      return false;
    }

    // Master toggle is a kill switch - if off, never use proxy
    const masterToggle = await getMasterToggle();
    if (!masterToggle) {
      return false;
    }

    // Master toggle is on, now check circuit breaker
    const circuitBreaker = await getCircuitBreakerState();
    return circuitBreaker !== null;
  }

  async function fetchViaProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    let response: Response;

    if (proxyConfig.type === ProxyType.URL_REWRITE) {
      // HaloQuery-style: rewrite URL and pass through headers
      const transformedUrl = transformUrlForProxy(url, proxyConfig.baseUrl);
      const headers = init?.headers ? new Headers(init.headers) : new Headers();
      const proxiedHeaders = filterHeadersForProxy(headers);

      logService.info(`Proxying request via URL rewrite: ${url} -> ${transformedUrl}`);

      response = await fetch(transformedUrl, {
        ...init,
        headers: proxiedHeaders,
      });
    } else {
      // JSON-RPC style (existing behavior for backward compatibility)
      logService.info(`Proxying request via JSON-RPC: ${url}`);
      response = await fetch(input, init);
    }

    logCacheStatus(response, url, true);

    return response;
  }

  return async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const cacheInit: RequestInit =
      input instanceof Request ? { ...init, method: init?.method ?? input.method } : { ...init };
    const kvCachedResponse = await getKvCachedResponse(url, cacheInit);
    if (kvCachedResponse != null) {
      return kvCachedResponse;
    }

    const useProxy = await shouldUseProxy();

    if (useProxy) {
      const proxiedResponse = await fetchViaProxy(input, init);
      await maybeCacheResponseInKv(url, cacheInit, proxiedResponse);
      return proxiedResponse;
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
      const response = await fetch(input, init);

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

        await new Promise((resolve) => setTimeout(resolve, retryMs));
        return await fetchWithRetry(attempt + 1);
      }

      if (ISSUE_STATUS_CODES.includes(response.status)) {
        logService.warn(`Rate limit error ${response.status.toString()} for ${url}`);

        await trackError(response.status, url);

        if (proxyConfig.enabled) {
          logService.info(`Retrying via proxy after rate limit error`);
          return await fetchViaProxy(input, init);
        }
      }

      return response;
    }

    try {
      const response = await fetchWithRetry();
      await maybeCacheResponseInKv(url, cacheInit, response);
      return response;
    } catch (error) {
      logService.error(error, new Map([["url", url]]));
      throw error;
    }
  };
}
