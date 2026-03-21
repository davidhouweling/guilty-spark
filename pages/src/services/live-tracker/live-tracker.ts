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

  /**
   * Performs a preflight check to see if the tracker exists before establishing WebSocket
   * @returns true if tracker exists, false if 404 (not found)
   */
  private async checkTrackerExists(identity: LiveTrackerIdentity): Promise<boolean> {
    const statusUrl =
      identity.type === "team"
        ? `${this.config.apiHost}/tracker/${identity.guildId}/${identity.queueNumber}/status`
        : `${this.config.apiHost}/tracker/individual/${identity.gamertag}/status`;

    try {
      const response = await fetch(statusUrl);
      return response.ok; // Returns true for 2xx, false for 404/other errors
    } catch {
      // Network error - assume tracker might exist but we can't verify
      return true;
    }
  }

  public async connect(identity: LiveTrackerIdentity): Promise<LiveTrackerConnection> {
    // Parse the host from the HTTP(S) URL for WebSocket connection
    const apiUrl = new URL(this.config.apiHost);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      identity.type === "team"
        ? `${protocol}//${apiUrl.host}/ws/tracker/${identity.guildId}/${identity.queueNumber}`
        : `${protocol}//${apiUrl.host}/ws/tracker/individual/${identity.gamertag}`;

    // Preflight check to detect 404 before attempting WebSocket
    const trackerExists = await this.checkTrackerExists(identity);
    if (!trackerExists) {
      // Create a dummy connection that immediately reports "not_found"
      const ws = new WebSocket(wsUrl); // Still create WS to maintain API contract
      const connection = new RealLiveTrackerConnection(ws);

      // Close the WebSocket immediately
      ws.close();

      // Report not found status
      setTimeout(() => {
        connection.handleStatus("not_found");
      }, 0);

      return connection;
    }

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
