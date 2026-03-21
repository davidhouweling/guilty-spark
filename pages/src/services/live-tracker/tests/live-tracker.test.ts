import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LiveTrackerIdentity } from "@guilty-spark/contracts/live-tracker/types";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/fakes/data";
import { RealLiveTrackerService } from "../live-tracker";
import type { LiveTrackerListener } from "../types";

class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public readonly url: string;

  public constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public close(): void {
    if (this.onclose) {
      const event = new CloseEvent("close", { code: 1000 });
      this.onclose(event);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public send(_data: string): void {
    // No-op for tests
  }

  public static instances: MockWebSocket[] = [];

  public static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe("RealLiveTrackerService", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.reset();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  it("creates WebSocket connection with correct URL for https protocol", async () => {
    Object.defineProperty(window, "location", {
      value: { protocol: "https:" },
      writable: true,
    });

    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    await service.connect(identity);

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]?.url).toBe("wss://api.example.com/ws/tracker/123/5");
  });

  it("creates WebSocket connection with correct URL for http protocol", async () => {
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
    });

    const service = new RealLiveTrackerService({ apiHost: "http://localhost:8787" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "456", queueNumber: "3" };

    await service.connect(identity);

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:8787/ws/tracker/456/3");
  });

  it("creates connection and allows status subscription", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("emits connected status when WebSocket opens", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onopen) {
      ws.onopen(new Event("open"));
    }

    expect(statusListener).toHaveBeenCalledWith("connected", undefined);
  });

  it("emits error status when WebSocket errors", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onerror) {
      ws.onerror(new Event("error"));
    }

    expect(statusListener).toHaveBeenCalledWith("error", undefined);
  });

  it("emits stopped status when WebSocket closes with stopped reason", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onclose) {
      ws.onclose(new CloseEvent("close", { code: 1000, reason: "Tracker stopped" }));
    }

    expect(statusListener).toHaveBeenCalledWith("stopped", undefined);
  });

  it("emits disconnected status when WebSocket closes normally", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onclose) {
      ws.onclose(new CloseEvent("close", { code: 1000 }));
    }

    expect(statusListener).toHaveBeenCalledWith("disconnected", undefined);
  });

  it("emits error status with reason when WebSocket closes abnormally", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onclose) {
      ws.onclose(new CloseEvent("close", { code: 1006, reason: "Connection lost" }));
    }

    expect(statusListener).toHaveBeenCalledWith("error", "Connection lost");
  });

  it("parses and emits valid LiveTracker messages", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const messageListener = vi.fn<LiveTrackerListener>();
    connection.subscribe(messageListener);

    const [ws] = MockWebSocket.instances;
    if (ws.onmessage) {
      const messageData = JSON.stringify(sampleLiveTrackerStateMessage);
      ws.onmessage(new MessageEvent("message", { data: messageData }));
    }

    expect(messageListener).toHaveBeenCalledTimes(1);
    expect(messageListener).toHaveBeenCalledWith(sampleLiveTrackerStateMessage);
  });

  it("ignores non-string WebSocket messages", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const messageListener = vi.fn();
    connection.subscribe(messageListener);

    const [ws] = MockWebSocket.instances;
    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: new Blob() }));
    }

    expect(messageListener).not.toHaveBeenCalled();
  });

  it("ignores invalid JSON messages", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const messageListener = vi.fn();
    connection.subscribe(messageListener);

    const [ws] = MockWebSocket.instances;
    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: "invalid json" }));
    }

    expect(messageListener).not.toHaveBeenCalled();
  });

  it("emits stopped status and disconnects when message status is stopped", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();
    const messageListener = vi.fn<LiveTrackerListener>();

    connection.subscribeStatus(statusListener);
    connection.subscribe(messageListener);

    statusListener.mockClear();

    const stoppedMessage = {
      ...sampleLiveTrackerStateMessage,
      data: { ...sampleLiveTrackerStateMessage.data, status: "stopped" as const },
    };

    const [ws] = MockWebSocket.instances;
    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: JSON.stringify(stoppedMessage) }));
    }

    expect(messageListener).toHaveBeenCalledWith(stoppedMessage);
    expect(statusListener).toHaveBeenCalledWith("stopped", undefined);
  });

  it("allows subscribing and unsubscribing message listeners", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const messageListener = vi.fn<LiveTrackerListener>();

    const subscription = connection.subscribe(messageListener);

    const [ws] = MockWebSocket.instances;
    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: JSON.stringify(sampleLiveTrackerStateMessage) }));
    }

    expect(messageListener).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();

    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: JSON.stringify(sampleLiveTrackerStateMessage) }));
    }

    expect(messageListener).toHaveBeenCalledTimes(1);
  });

  it("allows subscribing and unsubscribing status listeners", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const statusListener = vi.fn();

    const subscription = connection.subscribeStatus(statusListener);
    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    if (ws.onopen) {
      ws.onopen(new Event("open"));
    }

    expect(statusListener).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();

    if (ws.onerror) {
      ws.onerror(new Event("error"));
    }

    expect(statusListener).toHaveBeenCalledTimes(1);
  });

  it("closes WebSocket and clears listeners on disconnect", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);
    const messageListener = vi.fn();
    const statusListener = vi.fn();

    connection.subscribe(messageListener);
    connection.subscribeStatus(statusListener);

    statusListener.mockClear();

    const [ws] = MockWebSocket.instances;
    const closeSpy = vi.spyOn(ws, "close");

    connection.disconnect();

    expect(closeSpy).toHaveBeenCalled();

    if (ws.onmessage) {
      ws.onmessage(new MessageEvent("message", { data: JSON.stringify(sampleLiveTrackerStateMessage) }));
    }

    expect(messageListener).not.toHaveBeenCalled();
  });

  it("closes WebSocket when window goes offline", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);

    const [ws] = MockWebSocket.instances;
    const closeSpy = vi.spyOn(ws, "close");

    window.dispatchEvent(new Event("offline"));

    expect(closeSpy).toHaveBeenCalled();

    connection.disconnect();
  });

  it("removes offline listener on disconnect", async () => {
    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const connection = await service.connect(identity);

    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    connection.disconnect();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });

  it("emits not_found status when server returns 404 for tracker status", async () => {
    // Mock fetch to return 404 for the status endpoint
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "team", guildId: "123", queueNumber: "5" };

    const statusListener = vi.fn();

    const connection = await service.connect(identity);
    connection.subscribeStatus(statusListener);

    // Wait for async status update
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should have received not_found status
    expect(statusListener).toHaveBeenCalledWith("not_found", undefined);

    // WebSocket should have been closed immediately
    const [ws] = MockWebSocket.instances;
    expect(ws).toBeDefined();

    connection.disconnect();
    global.fetch = originalFetch;
  });

  it("emits not_found status when server returns 404 for individual tracker", async () => {
    // Mock fetch to return 404 for the status endpoint
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const service = new RealLiveTrackerService({ apiHost: "https://api.example.com" });
    const identity: LiveTrackerIdentity = { type: "individual", gamertag: "TestPlayer" };

    const statusListener = vi.fn();

    const connection = await service.connect(identity);
    connection.subscribeStatus(statusListener);

    // Wait for async status update
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should have received not_found status
    expect(statusListener).toHaveBeenCalledWith("not_found", undefined);

    connection.disconnect();
    global.fetch = originalFetch;
  });
});
