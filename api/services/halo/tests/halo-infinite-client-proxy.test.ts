import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { createHaloInfiniteClientProxy } from "../halo-infinite-client-proxy";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";

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

  it("calls a GET operation with arguments encoded in the query string and credentials included", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse({ xuid: "123" }));

    const proxy = createHaloInfiniteClientProxy({ env });

    const result = await proxy.getUser("foo");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${env.PROXY_WORKER_URL}/proxy/halo-infinite/getUser?arg=%22foo%22`);
    expect(options.method).toBe("GET");
    expect((options as RequestInit & { credentials?: string }).credentials).toBe("include");
    expect(options.body).toBeUndefined();
    const sentHeaders = new Headers(options.headers);
    expect(sentHeaders.get("x-proxy-auth")).toBeNull();

    expect(result).toEqual({ xuid: "123" });
  });

  it("calls the multi-user operation as a GET with the array argument encoded in the query string", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse([{ xuid: "123" }]));

    const proxy = createHaloInfiniteClientProxy({ env });

    const result = await proxy.getUsers(["xuid(123)"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe("/proxy/halo-infinite/getUsers");
    expect(parsedUrl.searchParams.getAll("arg")).toEqual([JSON.stringify(["xuid(123)"])]);
    expect(options.method).toBe("GET");
    expect((options as RequestInit & { credentials?: string }).credentials).toBe("include");
    expect(options.body).toBeUndefined();

    expect(result).toEqual([{ xuid: "123" }]);
  });

  it("returns raw json payloads without a result envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse({ xuid: "123" }));

    const proxy = createHaloInfiniteClientProxy({ env });

    const result = await proxy.getUser("foo");

    expect(result).toEqual({ xuid: "123" });
  });

  it("throws a clear error when calling an operation outside the allowlist", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const proxy = createHaloInfiniteClientProxy({ env });

    let thrown: Error | undefined;
    try {
      await proxy.getCurrentUser();
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("Halo proxy operation not allowed: getCurrentUser");
    expect(fetchSpy).not.toHaveBeenCalled();
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
});
