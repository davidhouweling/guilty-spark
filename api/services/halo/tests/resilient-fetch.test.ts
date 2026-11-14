import type { MockInstance } from "vitest";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createResilientFetch } from "../resilient-fetch";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeResponseWith } from "../fakes/resilient-fetch.fake";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";

describe("createResilientFetch", () => {
  let env: Env;
  let logService: LogService;
  let fetchSpy: MockInstance<typeof fetch>;
  let kvGetSpy: MockInstance;
  let kvPutSpy: MockInstance;
  let logServiceErrorSpy: MockInstance<typeof logService.error>;
  let logServiceWarnSpy: MockInstance<typeof logService.warn>;
  let logServiceDebugSpy: MockInstance<typeof logService.debug>;

  beforeEach(() => {
    vi.useFakeTimers();
    env = aFakeEnvWith({
      MODE: "production",
    });
    logService = aFakeLogServiceWith();

    fetchSpy = vi.spyOn(globalThis, "fetch");
    kvGetSpy = vi.spyOn(env.APP_DATA, "get");
    kvPutSpy = vi.spyOn(env.APP_DATA, "put");
    logServiceErrorSpy = vi.spyOn(logService, "error");
    logServiceWarnSpy = vi.spyOn(logService, "warn");
    logServiceDebugSpy = vi.spyOn(logService, "debug");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("direct requests", () => {
    it("makes a direct request", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://halostats.svc.halowaypoint.com/test",
        expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
      );
    });

    it("returns a 526 response without reading legacy proxy state or retrying", async () => {
      kvGetSpy.mockImplementation(async (key) => {
        if (key === "halo:proxy:enabled") {
          return await Promise.resolve("true");
        }
        if (key === "halo:proxy:circuit_breaker") {
          return await Promise.resolve({ activatedAt: Date.now(), expiresAt: Date.now() + 60_000, reason: "legacy" });
        }
        if (String(key).startsWith("halo:proxy:errors")) {
          return await Promise.resolve({ windowStart: 0, errors: [] });
        }
        return await Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(aFakeResponseWith({ status: 526 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const url = "https://halostats.svc.halowaypoint.com/test";
      const response = await resilientFetch(url);

      expect(response.status).toBe(526);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
      );
      expect(kvGetSpy.mock.calls.some(([key]) => String(key).startsWith("halo:proxy:"))).toBe(false);
      expect(kvPutSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("serves a cached Halo Waypoint response from KV before hitting network", async () => {
      kvGetSpy.mockImplementation(async (key) => {
        if (key === "halo:responses:https://halostats.svc.halowaypoint.com/test") {
          return Promise.resolve({
            status: 200,
            headers: [["content-type", "application/json"]],
            body: JSON.stringify({ source: "kv" }),
          });
        }
        return Promise.resolve(null);
      });

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const response = await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({ source: "kv" });
      expect(response.headers.get("x-gs-kv-cache")).toBe("HIT");
    });

    it("stores successful Halo Waypoint JSON responses into KV", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(kvPutSpy).toHaveBeenCalledWith(
        "halo:responses:https://halostats.svc.halowaypoint.com/test",
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) as number }),
      );
    });

    it("uses the supplied namespace for the response cache", async () => {
      const url = "https://halostats.svc.halowaypoint.com/test";
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
        kvKeyNamespace: "halo:film",
      });

      await resilientFetch(url);

      expect(kvGetSpy).toHaveBeenCalledWith(`halo:film:responses:${url}`, "json");
      expect(kvPutSpy).toHaveBeenCalledWith(`halo:film:responses:${url}`, expect.any(String), expect.any(Object));
      expect(kvGetSpy).not.toHaveBeenCalledWith(`halo:responses:${url}`, "json");
    });
  });

  describe("HTTP 429 retry logic", () => {
    it("retries 429 with retry-after header (seconds format)", async () => {
      kvGetSpy.mockResolvedValue(null);
      const rateLimitResponse = aFakeResponseWith({
        status: 429,
        body: { error: "rate limited" },
        headers: { "retry-after": "2" },
      });

      fetchSpy.mockResolvedValueOnce(rateLimitResponse).mockResolvedValueOnce(aFakeResponseWith({ status: 200 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(rateLimitResponse.bodyUsed).toBe(true);
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
      });

      const promise = resilientFetch("https://halostats.svc.halowaypoint.com/test");

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logServiceWarnSpy).toHaveBeenCalledWith(expect.stringContaining("retrying in 1000ms (attempt 1/3)"));
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
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).not.toHaveBeenCalledWith(expect.stringContaining("Cache "), expect.anything());
    });
  });

  describe("KV caching safety", () => {
    it("does not cache responses from non-halowaypoint domains resembling halowaypoint.com", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://evilhalowaypoint.com/test");

      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("evilhalowaypoint.com"),
        expect.anything(),
        expect.anything(),
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("does not read or write the response cache for batch user lookups", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({ status: 200, body: [], headers: { "content-type": "application/json" } }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://profile.svc.halowaypoint.com/users?xuids=1,2,3");

      expect(kvGetSpy).not.toHaveBeenCalledWith(expect.stringContaining("halo:responses:"), "json");
      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("halo:responses:"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("still caches single gamertag user lookups", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({ status: 200, body: {}, headers: { "content-type": "application/json" } }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://profile.svc.halowaypoint.com/users/gt(Player)");

      expect(kvPutSpy).toHaveBeenCalledWith(
        "halo:responses:https://profile.svc.halowaypoint.com/users/gt(Player)",
        expect.any(String),
        expect.anything(),
      );
    });

    it("returns null from getKvCachedResponse when KV throws instead of propagating error", async () => {
      kvGetSpy.mockImplementation(async (key) => {
        if (String(key).startsWith("halo:responses:")) {
          throw new Error("KV unavailable");
        }
        return Promise.resolve(null);
      });
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const response = await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("does not reject when KV put fails during cache store", async () => {
      kvGetSpy.mockResolvedValue(null);
      kvPutSpy.mockImplementation(async (key) => {
        if (String(key).startsWith("halo:responses:")) {
          return Promise.reject(new Error("KV write failure"));
        }
        return Promise.resolve();
      });
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await expect(resilientFetch("https://halostats.svc.halowaypoint.com/test")).resolves.toBeDefined();
    });

    it("skips KV caching when response has cache-control: no-store", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("halo:responses:"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("skips KV caching when response has cache-control: private", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "private, max-age=3600" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("halo:responses:"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("caches immutable match stats for 7 days even when cache-control is private", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          body: { MatchId: "abc-123" },
          headers: { "content-type": "application/json", "cache-control": "private, max-age=60" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/hi/matches/abc-123/stats");

      expect(kvPutSpy).toHaveBeenCalledWith(
        "halo:responses:https://halostats.svc.halowaypoint.com/hi/matches/abc-123/stats",
        expect.any(String),
        { expirationTtl: 604800 },
      );
    });

    it("logs the reason when a response is not cached", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch("https://halostats.svc.halowaypoint.com/test");

      expect(logServiceDebugSpy).toHaveBeenCalledWith(
        "KV cache skip for https://halostats.svc.halowaypoint.com/test",
        new Map([["reason", "cache-control no-store"]]),
      );
    });

    it("skips KV caching when input is a Request object with a non-GET method", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const request = new Request("https://halostats.svc.halowaypoint.com/test", { method: "POST" });
      await resilientFetch(request);

      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("halo:responses:"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("skips KV caching when input is a Request with non-GET method and init supplies only headers", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const request = new Request("https://halostats.svc.halowaypoint.com/test", { method: "POST" });
      await resilientFetch(request, { headers: { "x-custom": "value" } });

      expect(kvPutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("halo:responses:"),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("in-flight request sharing", () => {
    const url = "https://halostats.svc.halowaypoint.com/hi/matches/abc-123/stats";

    it("shares one network request between concurrent identical GETs", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(
        aFakeResponseWith({
          status: 200,
          body: { MatchId: "abc-123" },
          headers: { "content-type": "application/json" },
        }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const [first, second] = await Promise.all([resilientFetch(url), resilientFetch(url)]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(await first.json()).toEqual({ MatchId: "abc-123" });
      expect(await second.json()).toEqual({ MatchId: "abc-123" });
      expect(second.status).toBe(200);
      expect(logServiceDebugSpy).toHaveBeenCalledWith(`Sharing in-flight request for ${url}`);
    });

    it("does not share between concurrent GETs with different headers", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockImplementation(async (_input, init) =>
        Promise.resolve(
          aFakeResponseWith({
            status: 200,
            body: { range: new Headers(init?.headers).get("range") },
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const [first, second, third] = await Promise.all([
        resilientFetch(url, { headers: { Range: "bytes=0-9" } }),
        resilientFetch(url, { headers: { Range: "bytes=10-19" } }),
        resilientFetch(url, { headers: [["range", "bytes=0-9"]] }),
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(await first.json()).toEqual({ range: "bytes=0-9" });
      expect(await second.json()).toEqual({ range: "bytes=10-19" });
      expect(await third.json()).toEqual({ range: "bytes=0-9" });
    });

    it("returns bodyless responses such as 204 without throwing", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const [first, second] = await Promise.all([resilientFetch(url), resilientFetch(url)]);

      expect(first.status).toBe(204);
      expect(second.status).toBe(204);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("makes a new request once the previous request has settled", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockImplementation(async () =>
        Promise.resolve(aFakeResponseWith({ status: 200, body: {}, headers: { "content-type": "text/plain" } })),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await resilientFetch(url);
      await resilientFetch(url);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("does not share requests that supply an abort signal", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockImplementation(async () =>
        Promise.resolve(aFakeResponseWith({ status: 200, body: {}, headers: { "content-type": "text/plain" } })),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      await Promise.all([
        resilientFetch(url, { signal: new AbortController().signal }),
        resilientFetch(url, { signal: new AbortController().signal }),
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("rejects every sharer and clears the entry when the request fails", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockRejectedValueOnce(new Error("network down"));
      fetchSpy.mockResolvedValueOnce(
        aFakeResponseWith({ status: 200, body: {}, headers: { "content-type": "text/plain" } }),
      );

      const resilientFetch = createResilientFetch({
        env,
        logService,
      });

      const results = await Promise.allSettled([resilientFetch(url), resilientFetch(url)]);
      const retried = await resilientFetch(url);

      expect(results.map(({ status }) => status)).toEqual(["rejected", "rejected"]);
      expect(retried.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("request timeout", () => {
    function aNeverRespondingFetch(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
      return async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
          });
        });
    }

    it("rejects and logs the url when a direct request does not respond within the timeout", async () => {
      kvGetSpy.mockResolvedValue(null);
      fetchSpy.mockImplementation(aNeverRespondingFetch());

      const resilientFetch = createResilientFetch({
        env,
        logService,
        requestTimeoutMs: 5,
      });

      await expect(resilientFetch("https://halostats.svc.halowaypoint.com/test")).rejects.toHaveProperty(
        "name",
        "TimeoutError",
      );
      expect(logServiceErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "TimeoutError" }),
        new Map([
          ["url", "https://halostats.svc.halowaypoint.com/test"],
          ["timeoutMs", "5"],
        ]),
      );
    });
  });
});
