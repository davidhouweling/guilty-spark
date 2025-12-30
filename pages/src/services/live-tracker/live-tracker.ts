import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import { tryParseLiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/parse";
import type {
  LiveTrackerConnection,
  LiveTrackerListener,
  LiveTrackerStatusListener,
  LiveTrackerService,
  LiveTrackerSubscription,
} from "./types";

interface Config {
  readonly apiHost: string;
}

class RealLiveTrackerConnection implements LiveTrackerConnection {
  private readonly listeners = new Set<LiveTrackerListener>();
  private readonly statusListeners = new Set<LiveTrackerStatusListener>();
  private ws: WebSocket | null;

  public constructor(ws: WebSocket) {
    this.ws = ws;
  }

  public subscribe(listener: LiveTrackerListener): LiveTrackerSubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: LiveTrackerStatusListener): LiveTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.listeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(
    status: "connecting" | "connected" | "stopped" | "error" | "disconnected",
    detail?: string,
  ): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleMessage(message: LiveTrackerMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }

    if (message.type === "stopped") {
      this.handleStatus("stopped");
      this.disconnect();
    }
  }
}

export class RealLiveTrackerService implements LiveTrackerService {
  private readonly config: Config;

  public constructor(config: Config) {
    this.config = config;
  }

  public connect(identity: LiveTrackerIdentity): LiveTrackerConnection {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${this.config.apiHost}/ws/tracker/${identity.guildId}/${identity.channelId}/${identity.queueNumber}`;

    const ws = new WebSocket(wsUrl);
    const connection = new RealLiveTrackerConnection(ws);

    connection.handleStatus("connecting");

    ws.onopen = (): void => {
      connection.handleStatus("connected");
    };

    ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== "string") {
        return;
      }

      const message = tryParseLiveTrackerMessage(event.data);
      if (message) {
        connection.handleMessage(message);
      }
    };

    ws.onerror = (): void => {
      connection.handleStatus("error");
    };

    ws.onclose = (event: CloseEvent): void => {
      if (event.code === 1000 && event.reason === "Tracker stopped") {
        connection.handleMessage({ type: "stopped" });
        return;
      }

      if (event.code === 1000) {
        connection.handleStatus("disconnected");
        return;
      }

      connection.handleStatus("error", event.reason || undefined);
    };

    return connection;
  }
}
