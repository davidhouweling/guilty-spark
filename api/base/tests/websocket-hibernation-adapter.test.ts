import { afterEach, describe, expect, it, vi } from "vitest";
import { aFakeDurableObjectStateWith } from "../fakes/do.fake";
import { CloudflareWebSocketHibernationAdapter } from "../websocket-hibernation-adapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CloudflareWebSocketHibernationAdapter", () => {
  it("accepts an upgrade with hibernation tags", () => {
    const client = { close: vi.fn(), send: vi.fn() } as unknown as WebSocket;
    const serverSend = vi.fn();
    const server = { close: vi.fn(), send: serverSend } as unknown as WebSocket;
    class FakeWebSocketPair {
      readonly 0 = client;
      readonly 1 = server;
    }
    class FakeResponse {
      readonly status = 101;
      readonly webSocket = client;
    }
    const response = new FakeResponse();
    const state = aFakeDurableObjectStateWith();
    const acceptWebSocket = vi.spyOn(state, "acceptWebSocket");
    vi.stubGlobal("WebSocketPair", FakeWebSocketPair);
    vi.stubGlobal("Response", FakeResponse);

    const result = new CloudflareWebSocketHibernationAdapter().upgrade(state, "initial", ["format:condensed"]);

    expect(result).toMatchObject({ status: response.status, webSocket: client });
    expect(acceptWebSocket.mock.calls).toEqual([[server, ["format:condensed"]]]);
    expect(serverSend.mock.calls).toEqual([["initial"]]);
  });

  it("sends a broadcast only to an explicit recipient subset", () => {
    const includedSend = vi.fn();
    const excludedSend = vi.fn();
    const included = { close: vi.fn(), send: includedSend } as unknown as WebSocket;
    const excluded = { close: vi.fn(), send: excludedSend } as unknown as WebSocket;
    const state = aFakeDurableObjectStateWith({
      getWebSockets: () => [included, excluded],
    });

    new CloudflareWebSocketHibernationAdapter().broadcast(state, "condensed", [included]);

    expect(includedSend.mock.calls).toEqual([["condensed"]]);
    expect(excludedSend.mock.calls).toEqual([]);
  });
});
