import type { MockInstance } from "vitest";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createResilientFetch } from "../resilient-fetch.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import {
  aFakeCircuitBreakerStateWith,
  aFakeErrorWindowWith,
  aFakeResponseWith,
} from "../fakes/resilient-fetch.fake.mjs";
import { KV_KEYS, CIRCUIT_BREAKER_CONFIG } from "../types.mjs";
import type { LogService } from "../../log/types.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";

describe("createResilientFetch", () => {
  let env: Env;
  let logService: LogService;
  let fetchSpy: MockInstance<typeof fetch>;
  let kvGetSpy: MockInstance;
  let kvPutSpy: MockInstance;
  let logServiceErrorSpy: MockInstance<typeof logService.error>;
  let logServiceWarnSpy: MockInstance<typeof logService.warn>;
  let logServiceInfoSpy: MockInstance<typeof logService.info>;
  let logServiceDebugSpy: MockInstance<typeof logService.debug>;

  beforeEach(() => {
    vi.useFakeTimers();
    env = aFakeEnvWith({
      PROXY_WORKER_URL: "https://haloquery.com/proxy",
      MODE: "production",
    });
    logService = aFakeLogServiceWith();

    fetchSpy = vi.spyOn(globalThis, "fetch");
    kvGetSpy = vi.spyOn(env.APP_DATA, "get");
    kvPutSpy = vi.spyOn(env.APP_DATA, "put");
    logServiceErrorSpy = vi.spyOn(logService, "error");
    logServiceWarnSpy = vi.spyOn(logService, "warn");
    logServiceInfoSpy = vi.spyOn(logService, "info");
    logServiceDebugSpy = vi.spyOn(logService, "debug");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("direct requests (no proxy)", () => {
    it("makes direct request when proxy is disabled and no circuit breaker", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith("https://halostats.svc.halowaypoint.com/test", undefined);
    });

    it("makes direct request in production when master toggle is false and no circuit breaker", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(kvGetSpy).toHaveBeenCalledWith(KV_KEYS.PROXY_ENABLED);
      expect(kvGetSpy).not.toHaveBeenCalledWith(KV_KEYS.CIRCUIT_BREAKER, "json");
    });
  });

  describe("master toggle", () => {
    it("uses proxy when master toggle is enabled and circuit breaker is active", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/hi/players/test");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/hi/players/test",
        expect.anything(),
      );
      expect(logServiceInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Proxying request via URL rewrite"));
    });

    it("does not use proxy when master toggle is enabled but circuit breaker is inactive", async () => {
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledWith("https://halostats.svc.halowaypoint.com/test", undefined);
    });

    it("does not use proxy when master toggle is disabled even if circuit breaker is active", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve(null);
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledWith("https://halostats.svc.halowaypoint.com/test", undefined);
    });
  });

  describe("circuit breaker", () => {
    it("uses proxy when master toggle is on and circuit breaker is active", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/test",
        expect.anything(),
      );
    });

    it("activates circuit breaker after 3 errors in 15 minutes", async () => {
      const errorWindow = aFakeErrorWindowWith({ errorCount: 2 });
      kvGetSpy.mockImplementation(async (key: string) => {
        if (key.startsWith(KV_KEYS.ERROR_WINDOW)) {
          return Promise.resolve(errorWindow);
        }
        return Promise.resolve(null);
      });

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 526 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // Advance timers to trigger the debounced KV writes
      await vi.advanceTimersByTimeAsync(1000);

      // Should have tracked the error and activated circuit breaker
      expect(kvPutSpy).toHaveBeenCalledWith(
        expect.stringContaining(KV_KEYS.ERROR_WINDOW),
        expect.any(String),
        expect.objectContaining({
          expirationTtl: CIRCUIT_BREAKER_CONFIG.ERROR_TRACKING_TTL_SECONDS,
        }),
      );

      // Circuit breaker should be activated
      expect(kvPutSpy).toHaveBeenCalledWith(
        KV_KEYS.CIRCUIT_BREAKER,
        expect.any(String),
        expect.objectContaining({
          expirationTtl: expect.any(Number) as number,
        }),
      );

      expect(logServiceWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Circuit breaker activated"),
        expect.any(Map),
      );
    });
  });

  describe("HTTP 429 retry logic", () => {
    it("retries 429 with retry-after header (seconds format)", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "2" },
          }),
        )
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limit 429"));
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 2000ms (attempt 1/3)"));
    });

    it("retries 429 with retry-after header (HTTP date format)", async () => {
      kvGetSpy.mockResolvedValue(null);

      const futureDate = new Date(Date.now() + 3000);
      fetchSpy
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": futureDate.toUTCString() },
          }),
        )
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(3000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limit 429"));
    });

    it("retries 429 with default 1 second when retry-after is missing", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 429 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 1000ms (attempt 1/3)"));
    });

    it("uses exponential backoff on repeated 429s", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // First retry: 1s × 2^0 = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: 1s × 2^1 = 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 1000ms (attempt 1/3)"));
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 2000ms (attempt 2/3)"));
    });

    it("stops retrying after 3 attempts and returns failed response", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "1" },
          }),
        );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      const response = await promise;

      expect(response.status).toBe(429);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(logServiceErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Max retry attempts (3) reached") as string,
        }),
        expect.any(Map),
      );
    });

    it("handles invalid retry-after header and falls back to 1 second", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(
          aFakeResponseWith({
            status: 429,
            headers: { "retry-after": "invalid" },
          }),
        )
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 1000ms (attempt 1/3)"));
    });
  });

  describe("rate limit error handling", () => {
    it("retries via proxy on 526 error", async () => {
      kvGetSpy.mockResolvedValue(null);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 526 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limit error 526"));
      expect(logServiceInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Retrying via proxy"));
    });

    it("does not retry via proxy when proxy is disabled", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 526 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      const response = await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(response.status).toBe(526);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL transformation", () => {
    it("transforms URL correctly for HaloQuery proxy", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/hi/players/xuid(123)/matches?count=25");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/hi/players/xuid(123)/matches?count=25",
        expect.anything(),
      );
    });

    it("handles different subdomains correctly", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://economy.svc.halowaypoint.com/hi/store");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/economy.svc.halowaypoint.com/hi/store",
        expect.anything(),
      );
    });
  });

  describe("header preservation", () => {
    it("preserves all headers except host and content-length", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const headers = new Headers({
        "x-343-authorization-spartan": "spartan-token",
        authorization: "Bearer token",
        "user-agent": "test-agent",
        host: "should-be-removed.com",
        "content-length": "123",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test", { headers });

      const [, callInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const sentHeaders = new Headers(callInit.headers);

      expect(sentHeaders.get("x-343-authorization-spartan")).toBe("spartan-token");
      expect(sentHeaders.get("authorization")).toBe("Bearer token");
      expect(sentHeaders.get("user-agent")).toBe("test-agent");
      expect(sentHeaders.has("host")).toBe(false);
      expect(sentHeaders.has("content-length")).toBe(false);
    });
  });

  describe("error tracking", () => {
    it("tracks errors with timestamp and URL", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 526 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // Advance timers to trigger the debounced KV write
      await vi.advanceTimersByTimeAsync(1000);

      expect(kvPutSpy).toHaveBeenCalledWith(
        expect.stringContaining(KV_KEYS.ERROR_WINDOW),
        expect.stringMatching(/timestamp.*statusCode.*url/),
        expect.any(Object),
      );
    });

    it("filters out old errors from error window", async () => {
      const oldTimestamp = Date.now() - 20 * 60 * 1000; // 20 minutes ago
      const errorWindow = aFakeErrorWindowWith({
        errorCount: 1,
        statusCode: 526,
      });
      if (errorWindow.errors[0]) {
        errorWindow.errors[0].timestamp = oldTimestamp;
      }

      kvGetSpy.mockImplementation(async (key: string) => {
        if (key.startsWith(KV_KEYS.ERROR_WINDOW)) {
          return Promise.resolve(errorWindow);
        }
        return Promise.resolve(null);
      });

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 526 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // Should not activate circuit breaker since old error should be filtered
      const circuitBreakerCalls = kvPutSpy.mock.calls.filter((call) => call[0] === KV_KEYS.CIRCUIT_BREAKER);
      expect(circuitBreakerCalls).toHaveLength(0);
    });
  });

  describe("cache status logging", () => {
    it("logs cache HIT status for direct requests", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: {
            "cf-cache-status": "HIT",
            age: "30",
          },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).toHaveBeenCalledWith(
        "Cache HIT for https://halostats.svc.halowaypoint.com/test",
        expect.objectContaining({
          size: 2,
        }),
      );

      const debugCalls = (logServiceDebugSpy as ReturnType<typeof vi.fn>).mock.calls;
      expect(debugCalls.length).toBeGreaterThan(0);
      const [debugCall] = debugCalls;
      expect(debugCall).toBeDefined();
      if (debugCall) {
        const debugMap = debugCall[1] as Map<string, string>;
        expect(debugMap.get("cf-cache-status")).toBe("HIT");
        expect(debugMap.get("age")).toBe("30");
      }
    });

    it("logs cache MISS status for direct requests", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: {
            "cf-cache-status": "MISS",
          },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).toHaveBeenCalledWith(
        "Cache MISS for https://halostats.svc.halowaypoint.com/test",
        expect.any(Map),
      );

      const debugCalls = (logServiceDebugSpy as ReturnType<typeof vi.fn>).mock.calls;
      expect(debugCalls.length).toBeGreaterThan(0);
      const [debugCall] = debugCalls;
      expect(debugCall).toBeDefined();
      if (debugCall) {
        const debugMap = debugCall[1] as Map<string, string>;
        expect(debugMap.get("cf-cache-status")).toBe("MISS");
        expect(debugMap.get("age")).toBe("N/A");
      }
    });

    it("logs cache status with (via proxy) suffix for proxied requests", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      kvGetSpy.mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(circuitBreaker);
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: {
            "cf-cache-status": "HIT",
            age: "45",
          },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).toHaveBeenCalledWith(
        "Cache HIT for https://halostats.svc.halowaypoint.com/test (via proxy)",
        expect.any(Map),
      );
    });

    it("does not log when cf-cache-status header is missing", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: {},
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).not.toHaveBeenCalled();
    });
  });
});
