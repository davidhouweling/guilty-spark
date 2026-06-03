import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { createHaloInfiniteClientProxy, ProxyRequestError } from "../halo-infinite-client-proxy";

describe("createHaloInfiniteClientProxy", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GETs the proxy endpoint with the matchId appended as an arg query param", async () => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ MatchId: "abc-123" }), { status: 200 }));

    const client = createHaloInfiniteClientProxy({ proxyBaseUrl: "https://api.example.com" });
    await client.getMatchStats("abc-123");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.pathname).toBe("/proxy/halo-infinite/getMatchStats");
    expect(url.searchParams.getAll("arg")).toEqual(['"abc-123"']);
    expect(calledInit.method).toBe("GET");
  });

  it("returns undefined for a method outside the allowlist", () => {
    const client = createHaloInfiniteClientProxy({ proxyBaseUrl: "https://api.example.com" });
    const bogus = (client as unknown as Record<string, unknown>)["bogusMethod"];
    expect(bogus).toBeUndefined();
  });

  it("throws ProxyRequestError with the parsed error message on a non-200 response", async () => {
    expect.assertions(3);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ message: "Match not found" }), { status: 404 }));

    const client = createHaloInfiniteClientProxy({ proxyBaseUrl: "https://api.example.com" });

    try {
      await client.getMatchStats("missing-id");
    } catch (error) {
      if (error instanceof ProxyRequestError) {
        expect(error.message).toBe("Match not found");
        expect(error.statusCode).toBe(404);
        expect(error.requestUrl).toContain("/proxy/halo-infinite/getMatchStats");
      }
    }
  });

  it("sends the credentials option when specified", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const client = createHaloInfiniteClientProxy({
      proxyBaseUrl: "https://api.example.com",
      credentials: "include",
    });
    await client.getMatchStats("abc-123");

    const [, calledInit] = fetchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(calledInit["credentials"]).toBe("include");
  });
});
