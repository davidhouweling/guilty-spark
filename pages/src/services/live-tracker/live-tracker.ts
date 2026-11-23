import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import { tryParseLiveTrackerMessage } from "@guilty-spark/shared/live-tracker/parse";
import { createApiUrl } from "../api-url";
import { trackerStatusSchema } from "./resolve-series-source";
import type {
  LiveTrackerConnection,
  LiveTrackerListener,
  LiveTrackerStatusListener,
  LiveTrackerService,
  LiveTrackerSubscription,
} from "./types";

interface Config {
  readonly apiHost: string;
  readonly detectStopped?: boolean | undefined;
}

class RealLiveTrackerConnection implements LiveTrackerConnection {
  private readonly listeners = new Set<LiveTrackerListener>();
  private readonly statusListeners = new Set<LiveTrackerStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
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
    window.removeEventListener("offline", this.onOffline);

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.listeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(
    status: "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found",
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

    if (message.data.status === "stopped") {
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

  private async checkTrackerExists(identity: LiveTrackerIdentity): Promise<"available" | "not_found" | "stopped"> {
    const statusUrl = createApiUrl(this.config.apiHost, `/tracker/${identity.guildId}/${identity.queueNumber}/status`);
    const response = await fetch(statusUrl.toString(), { cache: "no-store" });
    if (response.status === 404) {
      return "not_found";
    }
    if (!response.ok) {
      throw new Error(`Tracker status request failed (${response.status.toString()})`);
    }
    if (this.config.detectStopped === true && response.status === 200) {
      const { state } = trackerStatusSchema.parse(await response.json());
      if (state.status === "stopped") {
        return "stopped";
      }
    }
    return "available";
  }

  public async connect(identity: LiveTrackerIdentity): Promise<LiveTrackerConnection> {
    const wsUrl = new URL(`/ws/tracker/${identity.guildId}/${identity.queueNumber}`, this.config.apiHost);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.searchParams.set("format", "condensed");

    // Preflight check to detect 404 before attempting WebSocket
    const trackerStatus = await this.checkTrackerExists(identity);
    if (trackerStatus !== "available") {
      // Create a dummy connection that immediately reports "not_found"
      const ws = new WebSocket(wsUrl.toString()); // Still create WS to maintain API contract
      const connection = new RealLiveTrackerConnection(ws);

      // Close the WebSocket immediately
      ws.close();

      // Report not found status
      setTimeout(() => {
        connection.handleStatus(trackerStatus);
      }, 0);

      return connection;
    }

    const ws = new WebSocket(wsUrl.toString());
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

    ws.onerror = (ev): void => {
      console.error("WebSocket error", ev);
      connection.handleStatus("error");
    };

    ws.onclose = (event: CloseEvent): void => {
      if (event.code === 1000 && event.reason === "Tracker stopped") {
        connection.handleStatus("stopped");
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
