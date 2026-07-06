import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { DirectoryListener, DirectoryStatusListener } from "../follow-types";
import { RealFollowLiveService } from "../follow";

class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public readonly url: string;
  public closed = false;

  public constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public close(): void {
    this.closed = true;
  }

  public static instances: MockWebSocket[] = [];

  public static reset(): void {
    MockWebSocket.instances = [];
  }
}

function aFakeDirectory(overrides: Partial<TrackerDirectory> = {}): TrackerDirectory {
  return {
    trackers: [],
    liveTrackerId: null,
    ...overrides,
  };
}

function directoryMessageData(directory: TrackerDirectory): string {
  return JSON.stringify({ type: "directory", directory });
}

describe("RealFollowLiveService.getDirectory", () => {
  it("fetches /u/<gamertag> with no credentials and returns the parsed directory", async () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const directory = aFakeDirectory();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(directory), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await service.getDirectory("SomeTag");

    expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/u/SomeTag", { method: "GET" });
    expect(result).toEqual(directory);
    fetchSpy.mockRestore();
  });

  it("throws on a non-ok response", async () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(service.getDirectory("SomeTag")).rejects.toThrow("not found");
    fetchSpy.mockRestore();
  });
});

describe("RealFollowLiveService.connectDirectory", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.reset();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  it("derives a wss URL from an https host", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });

    service.connectDirectory("SomeTag");

    expect(MockWebSocket.instances[0]?.url).toBe("wss://api.example.com/u/SomeTag/ws");
  });

  it("derives a ws URL from an http host", () => {
    const service = new RealFollowLiveService({ apiHost: "http://localhost:8787" });

    service.connectDirectory("SomeTag");

    expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:8787/u/SomeTag/ws");
  });

  it("emits directory to listeners on a valid message", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const directory = aFakeDirectory({ trackers: [] });
    const listener = vi.fn<DirectoryListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(new MessageEvent("message", { data: directoryMessageData(directory) }));

    expect(listener).toHaveBeenCalledWith(directory);
  });

  it("ignores malformed messages", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const listener = vi.fn<DirectoryListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify({ type: "directory", directory: { bogus: true } }) }),
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("disconnects and clears listeners on disconnect()", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const listener = vi.fn<DirectoryListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    connection.disconnect();

    ws.onmessage?.(new MessageEvent("message", { data: directoryMessageData(aFakeDirectory()) }));

    expect(listener).not.toHaveBeenCalled();
    expect(ws.closed).toBe(true);
  });

  it("closes the socket when the browser goes offline", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });

    service.connectDirectory("SomeTag");
    const [ws] = MockWebSocket.instances;

    window.dispatchEvent(new Event("offline"));

    expect(ws.closed).toBe(true);
  });

  it("emits connected when the socket opens", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<DirectoryStatusListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribeStatus(statusListener);

    expect(statusListener).not.toHaveBeenCalled();

    const [ws] = MockWebSocket.instances;
    ws.onopen?.(new Event("open"));

    expect(statusListener).toHaveBeenCalledWith("connected", undefined);
  });

  it("emits error when the socket errors", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<DirectoryStatusListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onerror?.(new Event("error"));

    expect(statusListener).toHaveBeenCalledWith("error", undefined);
  });

  it("emits disconnected when the socket closes normally", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<DirectoryStatusListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onclose?.(new CloseEvent("close", { code: 1000 }));

    expect(statusListener).toHaveBeenCalledWith("disconnected", undefined);
  });

  it("emits error with reason when the socket closes abnormally", () => {
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<DirectoryStatusListener>();

    const connection = service.connectDirectory("SomeTag");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onclose?.(new CloseEvent("close", { code: 1006, reason: "Connection lost" }));

    expect(statusListener).toHaveBeenCalledWith("error", "Connection lost");
  });

  it("stops closing the socket on offline once disconnected", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const service = new RealFollowLiveService({ apiHost: "https://api.example.com" });

    const connection = service.connectDirectory("SomeTag");
    connection.disconnect();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
