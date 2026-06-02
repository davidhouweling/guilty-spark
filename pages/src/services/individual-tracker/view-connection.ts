import type { TrackerViewMessage } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { trackerViewMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type {
  TrackerViewConnection,
  TrackerViewConnectionStatus,
  TrackerViewListener,
  TrackerViewStatusListener,
  TrackerViewSubscription,
} from "./view-types";

function tryParseViewMessage(raw: string): TrackerViewMessage | undefined {
  try {
    return trackerViewMessageContract.parse(raw);
  } catch {
    return undefined;
  }
}

export class RealTrackerViewConnection implements TrackerViewConnection {
  private readonly listeners = new Set<TrackerViewListener>();
  private readonly statusListeners = new Set<TrackerViewStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
  }

  public subscribe(listener: TrackerViewListener): TrackerViewSubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: TrackerViewStatusListener): TrackerViewSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    window.removeEventListener("offline", this.onOffline);

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.listeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(status: TrackerViewConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleRaw(raw: string): void {
    const message = tryParseViewMessage(raw);
    if (message === undefined) {
      return;
    }

    for (const listener of this.listeners) {
      listener(message.view);
    }

    if (message.view.status === "stopped") {
      this.handleStatus("stopped");
      this.disconnect();
    }
  }
}
