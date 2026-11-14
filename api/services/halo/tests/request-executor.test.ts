import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { HaloRequestExecutor } from "../request-executor";
import { createResilientFetch } from "../resilient-fetch";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve: (): void => {
      Preconditions.checkExists(resolve)();
    },
  };
}

describe("shared Halo HTTP lane", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts timeouts at the queued request's turn and releases after caller cancellation", async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const resilientFetch = createResilientFetch({
      env: aFakeEnvWith(),
      logService: aFakeLogServiceWith(),
      requestExecutor: new HaloRequestExecutor(),
    });
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      Preconditions.checkExists(init?.signal).throwIfAborted();
      if (fetchSpy.mock.calls.length === 1) {
        return await Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                bodyController = controller;
              },
            }),
          ),
        );
      }
      return await Promise.resolve(new Response("ok"));
    });
    const first = resilientFetch("https://example.com/first");
    await vi.advanceTimersByTimeAsync(0);
    const caller = new AbortController();
    const cancelled = resilientFetch("https://example.com/cancelled", { signal: caller.signal });
    const rejection = expect(cancelled).rejects.toThrow("cancelled");
    caller.abort(new Error("cancelled"));
    expect(timeoutSpy).toHaveBeenCalledTimes(1);

    Preconditions.checkExists(bodyController).close();
    await first;
    await rejection;
    expect(await (await resilientFetch("https://example.com/next")).text()).toBe("ok");
    expect(timeoutSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("holds through retries and binary body consumption across transports while cache hits bypass the lane", async () => {
    vi.useFakeTimers();
    const env = aFakeEnvWith();
    const logService = aFakeLogServiceWith();
    const requestExecutor = new HaloRequestExecutor();
    const dataFetch = createResilientFetch({ env, logService, requestExecutor });
    const authFetch = createResilientFetch({ env, logService, requestExecutor, kvKeyNamespace: "halo:user:test" });
    const cacheUrl = "https://halostats.svc.halowaypoint.com/cached";
    const getSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    getSpy.mockImplementation(async (key) =>
      Promise.resolve(key === `halo:responses:${cacheUrl}` ? { status: 200, headers: [], body: "cached" } : null),
    );
    const putSpy = vi.spyOn(env.APP_DATA, "put");
    let active = 0;
    let maximumActive = 0;
    let cancelled = false;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (fetchSpy.mock.calls.length === 1) {
        return await Promise.resolve(
          new Response(
            new ReadableStream({
              cancel(): void {
                cancelled = true;
                active -= 1;
              },
            }),
            { status: 429 },
          ),
        );
      }
      if (fetchSpy.mock.calls.length === 2) {
        return await Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                bodyController = controller;
              },
            }),
            { headers: { "content-type": "application/octet-stream" } },
          ),
        );
      }
      active -= 1;
      return await Promise.resolve(new Response("token"));
    });
    const first = dataFetch("https://halostats.svc.halowaypoint.com/film");
    await vi.advanceTimersByTimeAsync(0);
    const second = authFetch("https://halostats.svc.halowaypoint.com/spartan-token", {
      method: "POST",
      body: "{}",
    });
    expect(await (await dataFetch(cacheUrl)).text()).toBe("cached");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(cancelled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const controller = Preconditions.checkExists(bodyController);
    controller.enqueue(new Uint8Array([0, 127, 255]));
    active -= 1;
    controller.close();

    expect(new Uint8Array(await (await first).arrayBuffer())).toEqual(new Uint8Array([0, 127, 255]));
    expect(await (await second).text()).toBe("token");
    expect(maximumActive).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it.each(["network", "body"])(
    "releases after %s failure and preserves non-retryable error responses",
    async (mode) => {
      const requestExecutor = new HaloRequestExecutor();
      const resilientFetch = createResilientFetch({
        env: aFakeEnvWith(),
        logService: aFakeLogServiceWith(),
        requestExecutor,
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementationOnce(async () => {
          if (mode === "network") {
            return await Promise.reject(new Error("request failed"));
          }
          return await Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller): void {
                  controller.error(new Error("request failed"));
                },
              }),
            ),
          );
        })
        .mockResolvedValueOnce(
          new Response("unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "x-test": "kept" },
          }),
        );
      const first = resilientFetch("https://example.com/first");
      const next = resilientFetch("https://example.com/next");

      await expect(first).rejects.toThrow("request failed");
      const response = await next;
      expect(response.status).toBe(503);
      expect(response.statusText).toBe("Service Unavailable");
      expect(response.headers.get("x-test")).toBe("kept");
      expect(await response.text()).toBe("unavailable");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    },
  );
});

describe("HaloRequestExecutor", () => {
  it("waits for a running request to complete before starting queued requests in order", async () => {
    const executor = new HaloRequestExecutor();
    const gate = createDeferred();
    const order: string[] = [];
    const first = executor.execute(async () => {
      order.push("first:start");
      await gate.promise;
      order.push("first:end");
      return "first";
    });
    const second = executor.execute(async () => {
      order.push("second");
      return await Promise.resolve("second");
    });
    const third = executor.execute(async () => {
      order.push("third");
      return await Promise.resolve("third");
    });
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    gate.resolve();
    expect(await Promise.all([first, second, third])).toEqual(["first", "second", "third"]);
    expect(order).toEqual(["first:start", "first:end", "second", "third"]);
  });

  it("propagates a failed request without blocking subsequent requests", async () => {
    const executor = new HaloRequestExecutor();
    const first = executor.execute(async () => Promise.reject(new Error("request failed")));
    const second = executor.execute(async () => Promise.resolve("next"));

    await expect(first).rejects.toThrow("request failed");
    expect(await second).toBe("next");
  });
});
