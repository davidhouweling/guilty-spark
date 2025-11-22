import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RequestError } from "halo-infinite-api";
import { PlayerMatchesRateLimiter } from "../player-matches-rate-limiter.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

describe("PlayerMatchesRateLimiter", () => {
  let rateLimiter: PlayerMatchesRateLimiter;
  let logService: ReturnType<typeof aFakeLogServiceWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    logService = aFakeLogServiceWith();
    vi.spyOn(logService, "warn");
    vi.spyOn(logService, "info");
    vi.spyOn(logService, "error");
    rateLimiter = new PlayerMatchesRateLimiter({ logService, maxCallsPerSecond: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rate limiting", () => {
    it("allows 2 calls per second with proper spacing", async () => {
      const executionTimes: number[] = [];
      const mockFn = vi.fn(async () => {
        executionTimes.push(Date.now());
        return "success";
      });

      // Start 3 calls
      const promise1 = rateLimiter.execute(mockFn);
      const promise2 = rateLimiter.execute(mockFn);
      const promise3 = rateLimiter.execute(mockFn);

      // First call should execute immediately
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve(); // Let microtasks run
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second call should execute after 500ms (2 calls per second)
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Third call should execute after another 500ms
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(3);

      // Wait for all promises to resolve
      const results = await Promise.all([promise1, promise2, promise3]);
      expect(results).toEqual(["success", "success", "success"]);

      // Verify timing - should be approximately 0ms, 500ms, 1000ms
      expect(
        Preconditions.checkExists(executionTimes[1]) - Preconditions.checkExists(executionTimes[0]),
      ).toBeGreaterThanOrEqual(500);
      expect(
        Preconditions.checkExists(executionTimes[2]) - Preconditions.checkExists(executionTimes[1]),
      ).toBeGreaterThanOrEqual(500);
    });

    it("queues multiple requests and processes them in order", async () => {
      const executionOrder: number[] = [];
      const createMockFn = (id: number) =>
        vi.fn(async () => {
          executionOrder.push(id);
          return id;
        });

      const fn1 = createMockFn(1);
      const fn2 = createMockFn(2);
      const fn3 = createMockFn(3);
      const fn4 = createMockFn(4);

      // Start 4 calls
      const promise1 = rateLimiter.execute(fn1);
      const promise2 = rateLimiter.execute(fn2);
      const promise3 = rateLimiter.execute(fn3);
      const promise4 = rateLimiter.execute(fn4);

      // Execute all with proper delays
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();

      const results = await Promise.all([promise1, promise2, promise3, promise4]);

      expect(results).toEqual([1, 2, 3, 4]);
      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });

    it("does not throw errors during cooldown, but waits", async () => {
      const mockFn = vi.fn(async () => "success");

      const promise1 = rateLimiter.execute(mockFn);
      const promise2 = rateLimiter.execute(mockFn);

      // Both should eventually resolve without errors
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();

      const results = await Promise.all([promise1, promise2]);
      expect(results).toEqual(["success", "success"]);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("HTTP 429 retry logic", () => {
    it("retries once after HTTP 429 with retry-after header", async () => {
      const mockResponse = new Response(null, {
        status: 429,
        headers: { "retry-after": "2" },
      });
      const mockRequest = new URL("https://api.example.com/test");
      const error = new RequestError(mockRequest, mockResponse);

      let callCount = 0;
      const mockFn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw error;
        }
        return "success";
      });

      const promise = rateLimiter.execute(mockFn);

      // Initial execution
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Wait for retry-after (2 seconds)
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();

      const result = await promise;
      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 429 received"), expect.any(Map));
      expect(logService.info).toHaveBeenCalledWith(expect.stringContaining("Successfully retried"), expect.any(Map));
    });

    it("throws error if retry also returns HTTP 429", async () => {
      const mockResponse = new Response(null, {
        status: 429,
        headers: { "retry-after": "1" },
      });
      const mockRequest = new URL("https://api.example.com/test");
      const error = new RequestError(mockRequest, mockResponse);

      const mockFn = vi.fn(async () => {
        throw error;
      });

      const executePromise = rateLimiter.execute(mockFn);
      const promise = expect(executePromise).rejects.toThrow(RequestError);

      // Initial execution
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Wait for retry-after (1 second)
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      await promise;
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(logService.error).toHaveBeenCalledWith(
        expect.stringContaining("HTTP 429 received again after retry"),
        expect.any(Map),
      );
    });

    it("parses retry-after header as date format", async () => {
      const futureTime = Date.now() + 3000;
      const futureDate = new Date(futureTime).toUTCString();

      const mockResponse = new Response(null, {
        status: 429,
        headers: { "retry-after": futureDate },
      });
      const mockRequest = new URL("https://api.example.com/test");
      const error = new RequestError(mockRequest, mockResponse);

      let callCount = 0;
      const mockFn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw error;
        }
        return "success";
      });

      const promise = rateLimiter.execute(mockFn);

      // Initial execution
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Wait for retry-after (approximately 3 seconds)
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();

      const result = await promise;
      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("defaults to 1 second if retry-after header is missing", async () => {
      const mockResponse = new Response(null, {
        status: 429,
        headers: {},
      });
      const mockRequest = new URL("https://api.example.com/test");
      const error = new RequestError(mockRequest, mockResponse);

      let callCount = 0;
      const mockFn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw error;
        }
        return "success";
      });

      const promise = rateLimiter.execute(mockFn);

      // Initial execution
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Wait for default retry (1 second)
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      const result = await promise;
      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(logService.warn).toHaveBeenCalledWith(expect.stringContaining("No valid retry-after header"));
    });

    it("does not retry on non-429 errors", async () => {
      const error = new Error("Some other error");
      const mockFn = vi.fn(async () => {
        throw error;
      });

      const executePromise = rateLimiter.execute(mockFn);
      const promise = expect(executePromise).rejects.toThrow("Some other error");

      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      await promise;
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("combined rate limiting and retry", () => {
    it("respects rate limiting even when retrying after 429", async () => {
      const mockResponse = new Response(null, {
        status: 429,
        headers: { "retry-after": "1" },
      });
      const mockRequest = new URL("https://api.example.com/test");
      const error = new RequestError(mockRequest, mockResponse);

      let call1Count = 0;
      const mockFn1 = vi.fn(async () => {
        call1Count++;
        if (call1Count === 1) {
          throw error;
        }
        return "success1";
      });

      const mockFn2 = vi.fn(async () => "success2");

      // Start two calls
      const promise1 = rateLimiter.execute(mockFn1);
      const promise2 = rateLimiter.execute(mockFn2);

      // First call executes and fails with 429
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockFn1).toHaveBeenCalledTimes(1);

      // Second call should execute after rate limit delay
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      expect(mockFn2).toHaveBeenCalledTimes(1);

      // First call retries after retry-after duration
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      expect(mockFn1).toHaveBeenCalledTimes(2);

      const results = await Promise.all([promise1, promise2]);
      expect(results).toEqual(["success1", "success2"]);
    });
  });
});
