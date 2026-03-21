import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { Services } from "../../services/types";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerSubscription,
} from "../../services/live-tracker/types";
import type { LiveTrackerParams, LiveTrackerSnapshot, LiveTrackerStore } from "./live-tracker-store";
import type { LiveTrackerViewModel } from "./types";
import { toLiveTrackerStateRenderModel } from "./state-render-model";

interface Config {
  readonly services: Services;
  readonly getUrl: () => URL;
  readonly store: LiveTrackerStore;
}

export class LiveTrackerPresenter {
  public static readonly usageText = "Usage: /tracker?server=123&queue=1 or /tracker?gamertag=YourGamertag";

  private readonly config: Config;

  private isDisposed = false;
  private connection: LiveTrackerConnection | null = null;
  private messageSubscription: LiveTrackerSubscription | null = null;
  private statusSubscription: LiveTrackerSubscription | null = null;

  private reconnectionTimer: NodeJS.Timeout | null = null;
  private firstReconnectionTimestamp: number | null = null;
  private reconnectionAttempt = 0;
  private readonly maxReconnectionAttempts = 10;
  private readonly maxReconnectionDurationMs = 3 * 60 * 1000;
  private readonly baseReconnectionDelayMs = 2000;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: LiveTrackerSnapshot): LiveTrackerViewModel {
    const { connectionState, lastStateMessage, params, statusText: initialStatusText } = snapshot;

    let queueNumberText: string;
    let guildNameText: string;

    if (params.type === "team") {
      queueNumberText = params.queue.length > 0 ? params.queue : "Not set";
      guildNameText =
        lastStateMessage?.type === "state" && lastStateMessage.data.type === "neatqueue"
          ? lastStateMessage.data.guildName
          : params.server.length > 0
            ? `Guild ${params.server}`
            : "Not set";
    } else {
      queueNumberText = "Individual";
      guildNameText = params.gamertag.length > 0 ? params.gamertag : "Not set";
    }

    let statusClassName = "";
    if (connectionState === "connected") {
      statusClassName = "connected";
    } else if (
      connectionState === "error" ||
      connectionState === "stopped" ||
      connectionState === "connecting" ||
      connectionState === "not_found"
    ) {
      statusClassName = "error";
    }

    let statusText: string;

    if (connectionState === "connected" && lastStateMessage?.type === "state") {
      statusText = lastStateMessage.data.status;
    } else {
      statusText = initialStatusText;
    }

    return {
      guildNameText,
      queueNumberText,
      statusText,
      statusClassName,
      state: lastStateMessage?.type === "state" ? toLiveTrackerStateRenderModel(lastStateMessage) : null,
    };
  }

  private static parseParamsFromUrl(url: URL): LiveTrackerParams {
    const gamertag = url.searchParams.get("gamertag");
    if (gamertag !== null && gamertag.length > 0) {
      return {
        type: "individual",
        gamertag,
      };
    }

    return {
      type: "team",
      server: url.searchParams.get("server") ?? "",
      queue: url.searchParams.get("queue") ?? "",
    };
  }

  private static canConnect(params: LiveTrackerParams): boolean {
    if (params.type === "team") {
      return params.server.length > 0 && params.queue.length > 0;
    }
    return params.gamertag.length > 0;
  }

  private static toIdentity(params: LiveTrackerParams): LiveTrackerIdentity {
    if (params.type === "team") {
      return {
        type: "team",
        guildId: params.server,
        queueNumber: params.queue,
      };
    }
    return {
      type: "individual",
      gamertag: params.gamertag,
    };
  }

  public start(): void {
    const params = LiveTrackerPresenter.parseParamsFromUrl(this.config.getUrl());

    if (!LiveTrackerPresenter.canConnect(params)) {
      this.config.store.setSnapshot({
        params,
        connectionState: "idle",
        statusText: LiveTrackerPresenter.usageText,
        lastStateMessage: null,
        hasConnection: false,
        hasReceivedInitialData: false,
      });
      return;
    }

    this.disconnect();

    const previous = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...previous,
      params,
      connectionState: "connecting",
      statusText: "Connecting...",
      hasConnection: false,
    });

    void this.connectInternal(LiveTrackerPresenter.toIdentity(params));
  }

  public dispose(): void {
    this.isDisposed = true;
    this.disconnect();
  }

  private disconnect(): void {
    this.stopReconnection();
    this.cleanupConnection();

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: false,
      lastStateMessage: null,
      hasReceivedInitialData: false,
    });
  }

  private stopReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    this.firstReconnectionTimestamp = null;
    this.reconnectionAttempt = 0;
  }

  private cleanupConnection(): void {
    this.messageSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.messageSubscription = null;
    this.statusSubscription = null;

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  private async connectInternal(identity: LiveTrackerIdentity): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.cleanupConnection();

    const nextConnection = await this.config.services.liveTrackerService.connect(identity);
    this.connection = nextConnection;

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: true,
    });

    this.statusSubscription = nextConnection.subscribeStatus(
      (status: LiveTrackerConnectionStatus, detail?: string): void => {
        if (this.isDisposed) {
          return;
        }

        const snapshot = this.config.store.getSnapshot();

        if (status === "connected") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connected",
          });
          return;
        }

        if (status === "connecting") {
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connecting...",
          });
          return;
        }

        if (status === "stopped") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Tracker Stopped",
          });
          return;
        }

        if (status === "not_found") {
          this.stopReconnection();
          const message =
            snapshot.params.type === "individual"
              ? `No active tracker found for gamertag "${snapshot.params.gamertag}". Start a tracker first.`
              : "No active tracker found for this queue. Start a tracker first.";
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: message,
          });
          return;
        }

        this.handleConnectionLost(identity, detail);
      },
    );

    this.messageSubscription = nextConnection.subscribe((message: LiveTrackerMessage): void => {
      if (this.isDisposed) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();

      this.config.store.setSnapshot({
        ...snapshot,
        lastStateMessage: message,
        hasReceivedInitialData: true,
      });
    });
  }

  private handleConnectionLost(identity: LiveTrackerIdentity, detail?: string): void {
    const snapshot = this.config.store.getSnapshot();

    // If we've never received initial data, this is likely a "tracker not found" scenario
    // Don't retry in this case
    if (!snapshot.hasReceivedInitialData && this.reconnectionAttempt === 0) {
      const message =
        snapshot.params.type === "individual"
          ? `No active tracker found for gamertag "${snapshot.params.gamertag}". Start a tracker first.`
          : "No active tracker found for this queue. Start a tracker first.";
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "not_found",
        statusText: message,
      });
      this.stopReconnection();
      return;
    }

    const now = Date.now();
    this.firstReconnectionTimestamp ??= now;

    const elapsed = now - this.firstReconnectionTimestamp;

    if (elapsed > this.maxReconnectionDurationMs || this.reconnectionAttempt >= this.maxReconnectionAttempts) {
      const hasDetail = (detail?.length ?? 0) > 0;
      const errorText = hasDetail ? `Connection error: ${detail ?? ""}` : "Connection lost";
      const reason =
        elapsed > this.maxReconnectionDurationMs
          ? "Gave up after 3m"
          : `Max retries reached (${String(this.maxReconnectionAttempts)})`;
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "error",
        statusText: `${errorText} (${reason})`,
      });
      this.stopReconnection();
      return;
    }

    const backoffFactor = Math.pow(1.5, this.reconnectionAttempt);
    const delay = Math.min(this.baseReconnectionDelayMs * backoffFactor, 30000); // Cap at 30s
    const jitter = Math.random() * 1000;
    const totalDelay = delay + jitter;

    this.config.store.setSnapshot({
      ...snapshot,
      connectionState: "connecting",
      statusText: `Lost connection, reconnecting... (Attempt ${String(this.reconnectionAttempt + 1)}/${String(this.maxReconnectionAttempts)})`,
    });

    this.reconnectionTimer = setTimeout(() => {
      void this.connectInternal(identity);
      this.reconnectionAttempt++;
    }, totalDelay);
  }
}
