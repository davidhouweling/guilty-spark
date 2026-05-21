import type {
  IndividualTrackerState,
  IndividualTrackerStateMessage,
} from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualLiveTrackerService,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  StartTrackerRequest,
  StartTrackerResponse,
  StopTrackerResponse,
  TrackerStatusResponse,
} from "./types";

interface Config {
  readonly apiHost: string;
}

class RealIndividualTrackerConnection implements IndividualTrackerConnection {
  private readonly stateListeners = new Set<IndividualTrackerStateListener>();
  private readonly statusListeners = new Set<IndividualTrackerStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
  }

  public subscribe(listener: IndividualTrackerStateListener): IndividualTrackerSubscription {
    this.stateListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.stateListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: IndividualTrackerStatusListener): IndividualTrackerSubscription {
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
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleStateMessage(state: IndividualTrackerState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  public attachWebSocket(ws: WebSocket): void {
    this.ws = ws;
    this.onWebSocketSetup(ws);
  }

  private onWebSocketSetup(ws: WebSocket): void {
    ws.addEventListener("open", () => {
      this.handleStatus("connected");
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (
          parsed != null &&
          typeof parsed === "object" &&
          "type" in parsed &&
          "data" in parsed &&
          (parsed as { type: unknown }).type === "state"
        ) {
          const message = parsed as IndividualTrackerStateMessage;
          const { status } = message.data;
          if (status === "stopped") {
            this.handleStatus("stopped");
          }
          this.handleStateMessage(message.data);
        }
      } catch {
        // ignore unparseable messages
      }
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      if (event.code === 1000 && event.reason === "Tracker stopped") {
        this.handleStatus("stopped");
      } else {
        this.handleStatus("disconnected", event.reason === "" ? undefined : event.reason);
      }
    });

    ws.addEventListener("error", () => {
      this.handleStatus("error", "WebSocket connection failed");
    });
  }
}

export class RealIndividualLiveTrackerService implements IndividualLiveTrackerService {
  private readonly apiHost: string;

  public constructor({ apiHost }: Config) {
    this.apiHost = apiHost;
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.apiHost}${path}`, init);

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(reason === "" ? `Request failed (${String(response.status)})` : reason);
    }

    return response.json();
  }

  public async startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse> {
    return (await this.fetchJson("/api/individual-live-tracker/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    })) as StartTrackerResponse;
  }

  public async stopTracker(trackerId: string): Promise<StopTrackerResponse> {
    return (await this.fetchJson(`/api/individual-live-tracker/${encodeURIComponent(trackerId)}/stop`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })) as StopTrackerResponse;
  }

  public async getStatus(): Promise<TrackerStatusResponse> {
    return (await this.fetchJson("/api/individual-live-tracker/status", {
      credentials: "include",
    })) as TrackerStatusResponse;
  }

  public connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(
      `${wsHost}/ws/individual-tracker/${encodeURIComponent(userId)}/${encodeURIComponent(trackerId)}`,
    );

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public connectToActiveTracker(userId: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(`${wsHost}/ws/individual-tracker/${encodeURIComponent(userId)}/active`);

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public async getActiveTrackerState(userId: string): Promise<TrackerStatusResponse> {
    return (await this.fetchJson(
      `/api/individual-live-tracker/${encodeURIComponent(userId)}/active`,
    )) as TrackerStatusResponse;
  }
}
