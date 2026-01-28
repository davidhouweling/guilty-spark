import type { LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerConnectionStatus } from "../../services/live-tracker/types";

export type TrackerWebSocketDemoConnectionState = "idle" | LiveTrackerConnectionStatus;

export interface TrackerWebSocketDemoParams {
  readonly server: string;
  readonly queue: string;
}

export interface TrackerWebSocketDemoSnapshot {
  readonly params: TrackerWebSocketDemoParams;
  readonly connectionState: TrackerWebSocketDemoConnectionState;
  readonly statusText: string;
  readonly rawMessageText: string;
  readonly lastMessage: LiveTrackerMessage | null;
  readonly hasConnection: boolean;
}

export class TrackerWebSocketDemoStore {
  private snapshot: TrackerWebSocketDemoSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      params: {
        server: "",
        queue: "",
      },
      connectionState: "idle",
      statusText: "Waiting for query parameters",
      rawMessageText: "Usage: /tracker?server=1234567890&queue=123",
      lastMessage: null,
      hasConnection: false,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): TrackerWebSocketDemoSnapshot {
    return this.snapshot;
  }

  public setSnapshot(next: TrackerWebSocketDemoSnapshot): void {
    this.snapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
