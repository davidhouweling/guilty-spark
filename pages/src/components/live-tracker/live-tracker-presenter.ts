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
  public static readonly usageText = "Usage: /tracker?server=123&queue=1";

  private readonly config: Config;

  private isDisposed = false;
  private connection: LiveTrackerConnection | null = null;
  private messageSubscription: LiveTrackerSubscription | null = null;
  private statusSubscription: LiveTrackerSubscription | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: LiveTrackerSnapshot): LiveTrackerViewModel {
    const queueNumberText = snapshot.params.queue.length > 0 ? snapshot.params.queue : "Not set";

    const guildNameText =
      snapshot.lastMessage?.type === "state"
        ? snapshot.lastMessage.data.guildName
        : snapshot.params.server.length > 0
          ? `Guild ${snapshot.params.server}`
          : "Not set";

    let statusClassName = "";
    if (snapshot.connectionState === "connected") {
      statusClassName = "connected";
    } else if (snapshot.connectionState === "error" || snapshot.connectionState === "stopped") {
      statusClassName = "error";
    }

    return {
      guildNameText,
      queueNumberText,
      statusText: snapshot.statusText,
      statusClassName,
      rawMessageText: snapshot.rawMessageText,
      state: snapshot.lastMessage?.type === "state" ? toLiveTrackerStateRenderModel(snapshot.lastMessage) : null,
      isStopped: snapshot.lastMessage?.type === "stopped",
    };
  }

  private static parseParamsFromUrl(url: URL): LiveTrackerParams {
    return {
      server: url.searchParams.get("server") ?? "",
      queue: url.searchParams.get("queue") ?? "",
    };
  }

  private static canConnect(params: LiveTrackerParams): boolean {
    return params.server.length > 0 && params.queue.length > 0;
  }

  private static toIdentity(params: LiveTrackerParams): LiveTrackerIdentity {
    return {
      guildId: params.server,
      queueNumber: params.queue,
    };
  }

  public start(): void {
    const params = LiveTrackerPresenter.parseParamsFromUrl(this.config.getUrl());

    if (!LiveTrackerPresenter.canConnect(params)) {
      this.config.store.setSnapshot({
        params,
        connectionState: "idle",
        statusText: "Waiting for query parameters",
        rawMessageText: LiveTrackerPresenter.usageText,
        lastMessage: null,
        hasConnection: false,
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

    this.connectInternal(LiveTrackerPresenter.toIdentity(params));
  }

  public dispose(): void {
    this.isDisposed = true;
    this.disconnect();
  }

  private disconnect(): void {
    this.messageSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.messageSubscription = null;
    this.statusSubscription = null;

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: false,
      lastMessage: null,
    });
  }

  private connectInternal(identity: LiveTrackerIdentity): void {
    if (this.isDisposed) {
      return;
    }

    const nextConnection = this.config.services.liveTrackerService.connect(identity);
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
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connected",
            rawMessageText: snapshot.rawMessageText.includes("Usage:")
              ? "Connected! Waiting for data..."
              : snapshot.rawMessageText,
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
          const nextText = snapshot.rawMessageText.includes("🛑")
            ? snapshot.rawMessageText
            : `${snapshot.rawMessageText}\n\n🛑 Tracker has been stopped.`;

          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Tracker Stopped",
            rawMessageText: nextText,
          });
          return;
        }

        if (status === "disconnected") {
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Disconnected (Normal)",
          });
          return;
        }

        const suffix = detail !== undefined && detail.length > 0 ? `\n\nConnection closed: ${detail}` : "";

        this.config.store.setSnapshot({
          ...snapshot,
          connectionState: "error",
          statusText: "Connection error",
          rawMessageText: `${snapshot.rawMessageText}${suffix}`,
        });
      },
    );

    this.messageSubscription = nextConnection.subscribe((message: LiveTrackerMessage): void => {
      if (this.isDisposed) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();

      const nextRawMessageText = ((): string => {
        if (message.type !== "stopped") {
          return snapshot.rawMessageText;
        }

        return snapshot.rawMessageText.includes("🛑")
          ? snapshot.rawMessageText
          : `${snapshot.rawMessageText}\n\n🛑 Tracker has been stopped.`;
      })();

      this.config.store.setSnapshot({
        ...snapshot,
        rawMessageText: nextRawMessageText,
        lastMessage: message,
      });
    });
  }
}
