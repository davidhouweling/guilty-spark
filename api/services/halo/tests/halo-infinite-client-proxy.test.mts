import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createHaloInfiniteClientProxy } from "../halo-infinite-client-proxy.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

function createMockResponse(data: unknown, options: { ok?: boolean; status?: number; url?: string } = {}): Response {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  const url = options.url ?? "https://example.com";

  const response = new Response(JSON.stringify(data), { status, statusText: ok ? "OK" : "Error" });
  // The Response constructor doesn't allow setting the url property, so we need to define it
  Object.defineProperty(response, "url", {
    value: url,
    writable: false,
    enumerable: true,
    configurable: true,
  });
  return response;
}

describe("createHaloInfiniteClientProxy", () => {
  let env: Env;

  beforeEach(() => {
    env = aFakeEnvWith();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the proxy endpoint with the correct method and arguments", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse({ result: "proxy-result" }));

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse(
        {
          message: "400 from https://example.com/halo-infinite",
          stack: "proxy-stack",
          name: "ProxyError",
        },
        { ok: false, status: 500, url: "https://example.com/halo-infinite" },
      ),
    );

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;

    try {
      await proxy.getUser("foo");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("400 from https://example.com/halo-infinite");
    expect(thrown?.stack).toBeDefined();
    expect(thrown?.name).toBe("RequestError");
  });

  it("throws an error with the 'error' property if present in proxy error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse({ error: "Some proxy error" }, { ok: false, url: "https://example.com/halo-infinite" }),
    );

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;

    try {
      await proxy.getUser("foo");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    // The RequestError formats the message as "<status> from <url>" regardless of the original error message
    expect(thrown?.message).toBe("500 from https://example.com/halo-infinite");
  });

  it("throws a generic error if the proxy response is malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse({}));

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
