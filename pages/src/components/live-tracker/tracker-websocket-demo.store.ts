import type { LiveTrackerConnectionStatus } from "../../services/live-tracker/types";

export type TrackerWebSocketDemoConnectionState = "idle" | LiveTrackerConnectionStatus;

export interface TrackerWebSocketDemoParams {
  readonly guildId: string;
  readonly channelId: string;
  readonly queueNumber: string;
}

export interface TrackerWebSocketDemoSnapshot {
  readonly params: TrackerWebSocketDemoParams;
  readonly connectionState: TrackerWebSocketDemoConnectionState;
  readonly statusText: string;
  readonly rawMessageText: string;
  readonly hasConnection: boolean;
}

export class TrackerWebSocketDemoStore {
  private snapshot: TrackerWebSocketDemoSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      params: {
        guildId: "",
        channelId: "",
        queueNumber: "",
      },
      connectionState: "idle",
      statusText: "Waiting for query parameters",
      rawMessageText: "Usage: /tracker?guildId=123&channelId=456&queueNumber=1",
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
