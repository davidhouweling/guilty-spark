import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerViewListener, TrackerViewStatusListener } from "../view-types";
import { RealIndividualTrackerViewService } from "../view";
import { aFakeTrackerLiveViewWith, aFakeTrackerMatchSummaryWith } from "../fakes/view.fake";

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

function viewMessageData(view: ReturnType<typeof aFakeTrackerLiveViewWith>): string {
  return JSON.stringify({ type: "view", view });
}

describe("RealIndividualTrackerViewService.connect", () => {
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
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });

    service.connect("tracker 1");

    expect(MockWebSocket.instances[0]?.url).toBe("wss://api.example.com/api/individual-tracker/tracker%201/ws");
  });

  it("derives a ws URL from an http host", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "http://localhost:8787" });

    service.connect("tracker-2");

    expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:8787/api/individual-tracker/tracker-2/ws");
  });

  it("emits connected when the socket opens", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribeStatus(statusListener);

    expect(statusListener).not.toHaveBeenCalled();

    const [ws] = MockWebSocket.instances;
    ws.onopen?.(new Event("open"));

    expect(statusListener).toHaveBeenCalledWith("connected", undefined);
  });

  it("emits the view to subscribers on a valid message", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const view = aFakeTrackerLiveViewWith({ matches: [aFakeTrackerMatchSummaryWith()] });
    const listener = vi.fn<TrackerViewListener>();

    const connection = service.connect("tracker-1");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(new MessageEvent("message", { data: viewMessageData(view) }));

    expect(listener).toHaveBeenCalledWith(view);
  });

  it("ignores messages that fail contract validation", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const listener = vi.fn<TrackerViewListener>();

    const connection = service.connect("tracker-1");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "view", view: { bogus: true } }) }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("emits the stopped status and closes the socket on a stopped view", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const view = aFakeTrackerLiveViewWith({ status: "stopped" });
    const listener = vi.fn<TrackerViewListener>();
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribe(listener);
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(new MessageEvent("message", { data: viewMessageData(view) }));

    expect(listener).toHaveBeenCalledWith(view);
    expect(statusListener).toHaveBeenCalledWith("stopped", undefined);
    expect(ws.closed).toBe(true);
  });

  it("stops delivering views after a stopped view disconnects the connection", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const listener = vi.fn<TrackerViewListener>();

    const connection = service.connect("tracker-1");
    connection.subscribe(listener);

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(
      new MessageEvent("message", { data: viewMessageData(aFakeTrackerLiveViewWith({ status: "stopped" })) }),
    );
    listener.mockClear();

    ws.onmessage?.(
      new MessageEvent("message", { data: viewMessageData(aFakeTrackerLiveViewWith({ status: "active" })) }),
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("emits stopped when the socket closes with the stopped reason", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onclose?.(new CloseEvent("close", { code: 1000, reason: "Tracker stopped" }));

    expect(statusListener).toHaveBeenCalledWith("stopped", undefined);
  });

  it("emits disconnected when the socket closes normally", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onclose?.(new CloseEvent("close", { code: 1000 }));

    expect(statusListener).toHaveBeenCalledWith("disconnected", undefined);
  });

  it("emits error with the reason when the socket closes abnormally", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onclose?.(new CloseEvent("close", { code: 1006, reason: "Connection lost" }));

    expect(statusListener).toHaveBeenCalledWith("error", "Connection lost");
  });

  it("emits error when the socket errors", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const statusListener = vi.fn<TrackerViewStatusListener>();

    const connection = service.connect("tracker-1");
    connection.subscribeStatus(statusListener);

    const [ws] = MockWebSocket.instances;
    ws.onerror?.(new Event("error"));

    expect(statusListener).toHaveBeenCalledWith("error", undefined);
  });

  it("stops delivering views to an unsubscribed listener", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
    const listener = vi.fn<TrackerViewListener>();

    const connection = service.connect("tracker-1");
    const subscription = connection.subscribe(listener);
    subscription.unsubscribe();

    const [ws] = MockWebSocket.instances;
    ws.onmessage?.(new MessageEvent("message", { data: viewMessageData(aFakeTrackerLiveViewWith()) }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("closes the socket on disconnect", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });

    const connection = service.connect("tracker-1");
    const [ws] = MockWebSocket.instances;

    connection.disconnect();

    expect(ws.closed).toBe(true);
  });

  it("closes the socket when the browser goes offline", () => {
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });

    service.connect("tracker-1");
    const [ws] = MockWebSocket.instances;

    window.dispatchEvent(new Event("offline"));

    expect(ws.closed).toBe(true);
  });

  it("stops closing the socket on offline once disconnected", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });

    const connection = service.connect("tracker-1");
    connection.disconnect();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
