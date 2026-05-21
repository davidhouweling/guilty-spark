import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealIndividualLiveTrackerService } from "../individual-live-tracker";

class MockWebSocket {
  public static instances: MockWebSocket[] = [];

  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  public readonly url: string;

  public constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  public close(): void {
    this.emit("close", new CloseEvent("close", { code: 1000 }));
  }

  public emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  public static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe("RealIndividualLiveTrackerService", () => {
  let originalWebSocket: typeof WebSocket;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;
    originalFetch = global.fetch;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    global.fetch = vi.fn<typeof fetch>();
    MockWebSocket.reset();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    global.fetch = originalFetch;
  });

  it("emits disconnected status for normal WebSocket closes without tracker stopped reason", () => {
    const service = new RealIndividualLiveTrackerService({ apiHost: "https://api.example.com" });
    const connection = service.connectToActiveTracker("user-1");
    const statusListener = vi.fn();

    connection.subscribeStatus(statusListener);
    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    ws.emit("close", new CloseEvent("close", { code: 1000 }));

    expect(statusListener).toHaveBeenCalledWith("disconnected", undefined);
  });

  it("emits stopped status when the server closes the socket with tracker stopped reason", () => {
    const service = new RealIndividualLiveTrackerService({ apiHost: "https://api.example.com" });
    const connection = service.connectToActiveTracker("user-1");
    const statusListener = vi.fn();

    connection.subscribeStatus(statusListener);
    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    ws.emit("close", new CloseEvent("close", { code: 1000, reason: "Tracker stopped" }));

    expect(statusListener).toHaveBeenCalledWith("stopped", undefined);
  });

  it("throws response text when startTracker receives a non-JSON error response", async () => {
    const service = new RealIndividualLiveTrackerService({ apiHost: "https://api.example.com" });
    vi.mocked(fetch).mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(service.startTracker({})).rejects.toThrow("Unauthorized");
  });
});
