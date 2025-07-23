import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createHaloInfiniteClientProxy } from "../halo-infinite-client-proxy.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

describe("createHaloInfiniteClientProxy", () => {
  let env: Env;

  beforeEach(() => {
    env = aFakeEnvWith();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the proxy endpoint with the correct method and arguments", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => Promise.resolve({ result: "proxy-result" }),
    } as Response);

    const proxy = createHaloInfiniteClientProxy({ env });

    const result = await proxy.getUser("foo");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${env.PROXY_WORKER_URL}/proxy/halo-infinite`);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "content-type": "application/json",
      "x-proxy-auth": env.PROXY_WORKER_TOKEN,
    });
    expect(JSON.parse(options.body as string)).toEqual({
      method: "getUser",
      args: ["foo"],
    });

    expect(result).toBe("proxy-result");
  });

  it("throws an error with message, stack, and name from proxy error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () =>
        Promise.resolve({
          message: "Proxy error message",
          stack: "proxy-stack",
          name: "ProxyError",
        }),
    } as Response);

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;

    try {
      await proxy.getUser("foo");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("Proxy error message");
    expect(thrown?.stack).toBe("proxy-stack");
    expect(thrown?.name).toBe("ProxyError");
  });

  it("throws an error with the 'error' property if present in proxy error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => Promise.reject(new Error("Some proxy error")),
    } as Response);

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;

    try {
      await proxy.getUser("foo");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("Some proxy error");
  });

  it("throws a generic error if the proxy response is malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => Promise.resolve({}),
    } as Response);

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;

    try {
      await proxy.getUser("foo");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("Malformed proxy response");
  });
});
