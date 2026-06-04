import type { TrackerDirectoryMessage } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { trackerDirectoryMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type {
  DirectoryConnection,
  DirectoryConnectionStatus,
  DirectoryListener,
  DirectoryStatusListener,
  DirectorySubscription,
} from "./follow-types";

function tryParseDirectoryMessage(raw: string): TrackerDirectoryMessage | undefined {
  try {
    return trackerDirectoryMessageContract.parse(raw);
  } catch {
    return undefined;
  }
}

export class RealDirectoryConnection implements DirectoryConnection {
  private readonly listeners = new Set<DirectoryListener>();
  private readonly statusListeners = new Set<DirectoryStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
  }

  public subscribe(listener: DirectoryListener): DirectorySubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: DirectoryStatusListener): DirectorySubscription {
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

  public handleStatus(status: DirectoryConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleRaw(raw: string): void {
    const message = tryParseDirectoryMessage(raw);
    if (message === undefined) {
      return;
    }

    for (const listener of this.listeners) {
      listener(message.directory);
    }
  }
}
