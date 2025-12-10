import { addMilliseconds, differenceInSeconds } from "date-fns";
import type { LogService } from "../log/types.mjs";
import {
  type CircuitBreakerState,
  type ErrorWindow,
  type ProxyConfig,
  ProxyType,
  KV_KEYS,
  CIRCUIT_BREAKER_CONFIG,
  ISSUE_STATUS_CODES,
} from "./types.mjs";

interface ResilientFetchOptions {
  env: Env;
  logService: LogService;
  proxyUrl: string;
}

interface DebounceEntry {
  timeout: NodeJS.Timeout;
  data: string;
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

function getErrorWindowKey(): string {
  const windowStart = Math.floor(Date.now() / CIRCUIT_BREAKER_CONFIG.ERROR_WINDOW_MS);
  return `${KV_KEYS.ERROR_WINDOW}:${windowStart.toString()}`;
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

export function createResilientFetch({ env, logService, proxyUrl }: ResilientFetchOptions): typeof fetch {
  const proxyConfig: ProxyConfig = {
    type: detectProxyType(proxyUrl),
    baseUrl: proxyUrl,
    enabled: isValidUrl(proxyUrl),
  };

  const kvDebounceMap = new Map<string, DebounceEntry>();

  async function getMasterToggle(): Promise<boolean> {
    const value = await env.APP_DATA.get(KV_KEYS.PROXY_ENABLED);
    return value === "true";
  }

  async function getCircuitBreakerState(): Promise<CircuitBreakerState | null> {
    return await env.APP_DATA.get<CircuitBreakerState>(KV_KEYS.CIRCUIT_BREAKER, "json");
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

    scheduleKvWrite(KV_KEYS.CIRCUIT_BREAKER, JSON.stringify(state), ttlSeconds);

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
    const windowKey = getErrorWindowKey();
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
    const useProxy = await shouldUseProxy();

    if (useProxy) {
      return fetchViaProxy(input, init);
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
      return await fetchWithRetry();
    } catch (error) {
      logService.error(error as Error, new Map([["url", url]]));
      throw error;
    }
  };
}
