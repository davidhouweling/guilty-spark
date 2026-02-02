import type { LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerConnectionStatus } from "../../services/live-tracker/types";

export type LiveTrackerConnectionState = "idle" | LiveTrackerConnectionStatus;

export interface LiveTrackerParams {
  readonly server: string;
  readonly queue: string;
}

export interface LiveTrackerSnapshot {
  readonly params: LiveTrackerParams;
  readonly connectionState: LiveTrackerConnectionState;
  readonly statusText: string;
  readonly rawMessageText: string;
  readonly lastMessage: LiveTrackerMessage | null;
  readonly lastStateMessage: LiveTrackerMessage | null;
  readonly hasConnection: boolean;
}

export class LiveTrackerStore {
  private snapshot: LiveTrackerSnapshot;
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
      lastStateMessage: null,
      hasConnection: false,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): LiveTrackerSnapshot {
    return this.snapshot;
  }

  public setSnapshot(next: LiveTrackerSnapshot): void {
    this.snapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
