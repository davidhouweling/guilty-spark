/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
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

describe("createResilientFetch", () => {
  let env: Env;
  let logService: LogService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    env = aFakeEnvWith({
      PROXY_WORKER_URL: "https://haloquery.com/proxy",
      MODE: "production",
    });
    logService = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("direct requests (no proxy)", () => {
    it("makes direct request when proxy is disabled and no circuit breaker", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
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
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(env.APP_DATA.get).toHaveBeenCalledWith(KV_KEYS.PROXY_ENABLED);
      expect(env.APP_DATA.get).toHaveBeenCalledWith(KV_KEYS.CIRCUIT_BREAKER, "json");
    });
  });

  describe("master toggle", () => {
    it("uses proxy when master toggle is enabled", async () => {
      const kvGetSpy = vi.fn().mockImplementation(async (key) => {
        if (key === KV_KEYS.PROXY_ENABLED) {
          return Promise.resolve("true");
        }
        if (key === KV_KEYS.CIRCUIT_BREAKER) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      env.APP_DATA.get = kvGetSpy;
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/hi/players/test");

      // Debug: check what KV calls were made
      expect(kvGetSpy).toHaveBeenCalled();

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/hi/players/test",
        expect.anything(),
      );
      expect(logService.info).toHaveBeenCalledWith(expect.stringContaining("Proxying request via URL rewrite"));
    });
  });

  describe("circuit breaker", () => {
    it("uses proxy when circuit breaker is active", async () => {
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      env.APP_DATA.get = vi.fn().mockImplementation(async (key) => {
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

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/test",
        expect.anything(),
      );
    });

    it("activates circuit breaker after 3 errors in 15 minutes", async () => {
      const errorWindow = aFakeErrorWindowWith({ errorCount: 2 });
      env.APP_DATA.get = vi.fn().mockImplementation(async (key: string) => {
        if (key.startsWith(KV_KEYS.ERROR_WINDOW)) {
          return Promise.resolve(errorWindow);
        }
        return Promise.resolve(null);
      });
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 429 }))
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
      expect(env.APP_DATA.put).toHaveBeenCalledWith(
        expect.stringContaining(KV_KEYS.ERROR_WINDOW),
        expect.any(String),
        expect.objectContaining({
          expirationTtl: CIRCUIT_BREAKER_CONFIG.ERROR_TRACKING_TTL_SECONDS,
        }),
      );

      // Circuit breaker should be activated
      expect(env.APP_DATA.put).toHaveBeenCalledWith(
        KV_KEYS.CIRCUIT_BREAKER,
        expect.any(String),
        expect.objectContaining({
          expirationTtl: expect.any(Number),
        }),
      );

      expect(logService.warn).toHaveBeenCalledWith(
        expect.stringContaining("Circuit breaker activated"),
        expect.any(Map),
      );
    });
  });

  describe("rate limit error handling", () => {
    it("retries via proxy on 429 error", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 429 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      const response = await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "https://halostats.svc.halowaypoint.com/test", undefined);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/test",
        expect.anything(),
      );
      expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining("Rate limit error 429"));
      expect(logService.info).toHaveBeenCalledWith(expect.stringContaining("Retrying via proxy"));
    });

    it("retries via proxy on 526 error", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 526 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining("Rate limit error 526"));
    });

    it("does not retry via proxy when proxy is disabled", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 429 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "",
      });

      const response = await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(response.status).toBe(429);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL transformation", () => {
    it("transforms URL correctly for HaloQuery proxy", async () => {
      env.APP_DATA.get = vi.fn().mockImplementation(async (key) => {
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

      await resilientFetch("https://halostats.svc.halowaypoint.com/hi/players/xuid(123)/matches?count=25");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/hi/players/xuid(123)/matches?count=25",
        expect.anything(),
      );
    });

    it("handles different subdomains correctly", async () => {
      env.APP_DATA.get = vi.fn().mockImplementation(async (key) => {
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

      await resilientFetch("https://economy.svc.halowaypoint.com/hi/store");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/economy.svc.halowaypoint.com/hi/store",
        expect.anything(),
      );
    });
  });

  describe("header preservation", () => {
    it("preserves all headers except host and content-length", async () => {
      env.APP_DATA.get = vi.fn().mockImplementation(async (key) => {
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

  describe("development mode", () => {
    it("uses direct requests in development mode when master toggle is false", async () => {
      env.MODE = "development";
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledWith("https://halostats.svc.halowaypoint.com/test", undefined);
    });

    it("uses proxy in development mode when circuit breaker is active", async () => {
      env.MODE = "development";
      const circuitBreaker = aFakeCircuitBreakerStateWith();
      env.APP_DATA.get = vi.fn().mockImplementation(async (key) => {
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

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://haloquery.com/proxy/halostats.svc.halowaypoint.com/test",
        expect.anything(),
      );
    });
  });

  describe("error tracking", () => {
    it("tracks errors with timestamp and URL", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);
      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 429 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // Advance timers to trigger the debounced KV write
      await vi.advanceTimersByTimeAsync(1000);

      expect(env.APP_DATA.put).toHaveBeenCalledWith(
        expect.stringContaining(KV_KEYS.ERROR_WINDOW),
        expect.stringMatching(/timestamp.*statusCode.*url/),
        expect.any(Object),
      );
    });

    it("filters out old errors from error window", async () => {
      const oldTimestamp = Date.now() - 20 * 60 * 1000; // 20 minutes ago
      const errorWindow = aFakeErrorWindowWith({
        errorCount: 1,
        statusCode: 429,
      });
      if (errorWindow.errors[0]) {
        errorWindow.errors[0].timestamp = oldTimestamp;
      }

      env.APP_DATA.get = vi.fn().mockImplementation(async (key: string) => {
        if (key.startsWith(KV_KEYS.ERROR_WINDOW)) {
          return Promise.resolve(errorWindow);
        }
        return Promise.resolve(null);
      });
      env.APP_DATA.put = vi.fn().mockResolvedValue(undefined);

      fetchSpy
        .mockResolvedValueOnce(aFakeResponseWith({ status: 429 }))
        .mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
        proxyUrl: "https://haloquery.com/proxy",
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      // Should not activate circuit breaker since old error should be filtered
      const circuitBreakerCalls = (env.APP_DATA.put as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === KV_KEYS.CIRCUIT_BREAKER,
      );
      expect(circuitBreakerCalls).toHaveLength(0);
    });
  });
});
