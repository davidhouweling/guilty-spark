import * as Sentry from "@sentry/cloudflare";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import {
  userTrackerDirectoryMessageContract,
  type UserTrackerStatusResponse,
  type UserTrackerViewStateResponse,
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  trackerChangedPayloadSchema,
  userTrackerNudgeContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/nudge";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  CloudflareWebSocketHibernationAdapter,
  type WebSocketHibernationAdapter,
} from "../../base/websocket-hibernation-adapter";
import { fetchTrackerDoViewState, toTrackerView } from "../../routes/individual-tracker/mapper";
import type { DatabaseService } from "../../services/database/database";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type { IndividualTrackerService } from "../../services/individual-tracker/individual-tracker";
import { installServices as installServicesImpl } from "../../services/install";
import type { LogService } from "../../services/log/types";
import { emptyTrackerDirectory, type UserTrackerInternalState } from "./types";

const USER_TRACKER_STATE_KEY = "userTrackerState";
const FOLLOW_WS_POLL_INTERVAL_MS = 3000;

function isNonStopped(row: IndividualTrackersRow): boolean {
  return row.Status !== "stopped";
}

export class UserTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly individualTrackerService: IndividualTrackerService;
  private readonly webSocketAdapter: WebSocketHibernationAdapter;
  private closeTrackerSubscriptions: () => void = () => {
    // replaced once tracker subscriptions are installed
  };
  private pushInProgress = false;
  private pendingPush = false;
  private trackerSubscriptionsInstalled = false;

  constructor(
    state: DurableObjectState,
    env: Env,
    installServices = installServicesImpl,
    webSocketAdapter: WebSocketHibernationAdapter = new CloudflareWebSocketHibernationAdapter(),
  ) {
    this.state = state;
    this.env = env;
    const { logService, databaseService, individualTrackerService } = installServices({ env });
    this.logService = logService;
    this.databaseService = databaseService;
    this.individualTrackerService = individualTrackerService;
    this.webSocketAdapter = webSocketAdapter;
  }

  public async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "UserTrackerDO");
      Sentry.setTag("action", action ?? "unknown");
      Sentry.setContext("request", {
        method: request.method,
        path: url.pathname,
      });

      try {
        switch (action) {
          case "status": {
            if (request.method !== "GET") {
              return new Response("Method Not Allowed", { status: 405 });
            }
            return await this.handleStatus();
          }
          case "view-state": {
            if (request.method !== "GET") {
              return new Response("Method Not Allowed", { status: 405 });
            }
            return await this.handleViewState(request);
          }
          case "nudge": {
            if (request.method !== "POST") {
              return new Response("Method Not Allowed", { status: 405 });
            }
            return await this.handleNudge(request);
          }
          case "websocket": {
            if (request.method !== "GET") {
              return new Response("Method Not Allowed", { status: 405 });
            }
            return await this.handleWebSocket(request);
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error(error, new Map([["context", "UserTrackerDO fetch error"]]));
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.logService.debug(
      "UserTracker: WebSocket message received (ignored)",
      new Map([["messageType", typeof message]]),
    );
    return Promise.resolve();
  }

  async webSocketClose(_ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.logService.debug(
      "UserTracker: WebSocket client disconnected",
      new Map([
        ["code", code.toString()],
        ["reason", reason],
        ["wasClean", wasClean.toString()],
        ["remainingClients", this.state.getWebSockets().length.toString()],
      ]),
    );

    if (this.state.getWebSockets().length === 0) {
      this.stopUpdateLoop();
    }

    return Promise.resolve();
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    this.logService.warn("UserTracker: WebSocket error", new Map([["error", String(error)]]));
    return Promise.resolve();
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "UserTrackerDO");
      Sentry.setTag("method", "alarm");

      if (this.state.getWebSockets().length === 0) {
        await this.state.storage.deleteAlarm();
        return;
      }

      try {
        await this.refreshAndBroadcastIfChanged();
      } catch (error) {
        this.logService.error(error, new Map([["context", "UserTracker alarm error"]]));
        Sentry.captureException(error);
      }

      await this.scheduleNextAlarm();
    });
  }

  private async loadState(): Promise<UserTrackerInternalState> {
    const stored = await this.state.storage.get<UserTrackerInternalState>(USER_TRACKER_STATE_KEY);
    if (stored != null) {
      return stored;
    }

    return {
      state: null,
      viewState: null,
    };
  }

  private async handleStatus(): Promise<Response> {
    const stored = await this.loadState();
    const response: UserTrackerStatusResponse = {
      state: stored.state,
    };
    return userTrackerStatusContract.toResponse(response, { noStore: true });
  }

  private async handleViewState(request: Request): Promise<Response> {
    const stored = await this.getOrBuildState(request);
    const response: UserTrackerViewStateResponse = {
      state: stored?.viewState ?? null,
    };
    return userTrackerViewStateContract.toResponse(response, { noStore: true });
  }

  private async handleNudge(request: Request): Promise<Response> {
    const parsedBody = await parseJsonBody(request, trackerChangedPayloadSchema, "Invalid user tracker nudge payload");
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    this.queueDirectoryPush();
    return userTrackerNudgeContract.toResponse({ success: true }, { noStore: true });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const stored = await this.getOrBuildState(request);
    const directory = stored?.viewState?.directory ?? emptyTrackerDirectory;
    const payload = this.serializeDirectory(directory);
    const response = this.webSocketAdapter.upgrade(this.state, payload);
    this.ensureUpdateLoopStarted();
    return response;
  }

  private async getOrBuildState(request: Request): Promise<UserTrackerInternalState | null> {
    const stored = await this.loadState();
    const userId = stored.state?.userId ?? this.getRequestedUserId(request);

    if (userId == null) {
      return stored.viewState == null ? null : stored;
    }

    if (stored.viewState != null && stored.state?.userId === userId) {
      return stored;
    }

    return await this.rebuildDirectoryState(userId);
  }

  private getRequestedUserId(request: Request): string | null {
    const userId = new URL(request.url).searchParams.get("userId");
    if (userId == null || userId.trim() === "") {
      return null;
    }

    return userId;
  }

  private async rebuildDirectoryState(userId: string): Promise<UserTrackerInternalState> {
    const directory = await this.buildDirectory(userId);
    return await this.storeDirectoryState(userId, directory);
  }

  private async buildDirectory(userId: string): Promise<TrackerDirectory> {
    const [allTrackers, streamerSettings] = await Promise.all([
      this.databaseService.findIndividualTrackersByUserId(userId),
      this.individualTrackerService.getSettingsForView(userId),
    ]);

    const nonStopped = allTrackers.filter(isNonStopped);
    const statsHighlightSlots =
      streamerSettings.visibleSections?.statsHighlightSlots ??
      DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);

    const entries = await Promise.all(
      nonStopped.map(async (row): Promise<TrackerDirectoryEntry> => {
        const doState = await fetchTrackerDoViewState(this.env, row.UserId, row.TrackerId, statsHighlightSlots);
        return toTrackerView(row, doState);
      }),
    );

    const liveTracker = entries.find((entry) => entry.isLive);
    const firstActiveTracker = entries.find((entry) => entry.status === "active");
    const liveTrackerId = liveTracker?.trackerId ?? firstActiveTracker?.trackerId ?? null;

    return {
      trackers: entries,
      liveTrackerId,
      streamerSettings: Object.keys(streamerSettings).length > 0 ? streamerSettings : undefined,
    };
  }

  private async storeDirectoryState(userId: string, directory: TrackerDirectory): Promise<UserTrackerInternalState> {
    const lastUpdateTime = new Date().toISOString();
    const nextState: UserTrackerInternalState = {
      state: {
        userId,
        lastUpdateTime,
      },
      viewState: {
        userId,
        lastUpdateTime,
        directory,
      },
    };

    await this.state.storage.put(USER_TRACKER_STATE_KEY, nextState);
    return nextState;
  }

  private ensureUpdateLoopStarted(): void {
    void this.scheduleNextAlarm();

    if (this.trackerSubscriptionsInstalled) {
      return;
    }

    this.trackerSubscriptionsInstalled = true;
    void this.installTrackerSubscriptionsAsync();
  }

  private stopUpdateLoop(): void {
    this.closeTrackerSubscriptions();
    this.closeTrackerSubscriptions = (): void => {
      // reset after closing
    };
    this.trackerSubscriptionsInstalled = false;
    void this.state.storage.deleteAlarm();
  }

  private async installTrackerSubscriptionsAsync(): Promise<void> {
    const stored = await this.loadState();
    const userId = stored.state?.userId;
    if (userId == null) {
      this.trackerSubscriptionsInstalled = false;
      return;
    }

    try {
      const closeSubscriptions = await this.subscribeToTrackerUpdateSockets(userId);
      if (this.state.getWebSockets().length === 0) {
        closeSubscriptions();
        this.trackerSubscriptionsInstalled = false;
        return;
      }

      this.closeTrackerSubscriptions();
      this.closeTrackerSubscriptions = closeSubscriptions;
    } catch (error) {
      this.logService.error(error, new Map([["context", "UserTracker WebSocket subscription setup error"]]));
    }
  }

  private async subscribeToTrackerUpdateSockets(userId: string): Promise<() => void> {
    const rows = await this.databaseService.findIndividualTrackersByUserId(userId);
    const nonStoppedRows = rows.filter(isNonStopped);
    const sockets = (
      await Promise.all(
        nonStoppedRows.map(async (row): Promise<WebSocket | null> => {
          try {
            const doId = this.env.INDIVIDUAL_TRACKER_DO.idFromName(`${row.UserId}:${row.TrackerId}`);
            const stub = this.env.INDIVIDUAL_TRACKER_DO.get(doId);
            const response = await stub.fetch(
              new Request("http://do/websocket", {
                headers: {
                  Upgrade: "websocket",
                },
              }),
            );

            const socket = response.webSocket;
            if (socket == null) {
              return null;
            }

            socket.accept();
            socket.addEventListener("message", (): void => {
              this.queueDirectoryPush();
            });
            return socket;
          } catch (error) {
            this.logService.warn(
              error,
              new Map([
                ["context", "UserTracker WebSocket tracker subscription error"],
                ["trackerId", row.TrackerId],
              ]),
            );
            return null;
          }
        }),
      )
    ).filter((socket): socket is WebSocket => socket != null);

    return (): void => {
      for (const socket of sockets) {
        try {
          socket.close(1000, "User tracker websocket closing");
        } catch {
          // ignore close failures
        }
      }
    };
  }

  private queueDirectoryPush(): void {
    if (this.pushInProgress) {
      this.pendingPush = true;
      return;
    }

    this.pushInProgress = true;
    void this.queueDirectoryPushAsync();
  }

  private async queueDirectoryPushAsync(): Promise<void> {
    try {
      for (;;) {
        this.pendingPush = false;

        try {
          await this.refreshAndBroadcastIfChanged();
        } catch (error) {
          this.logService.error(error, new Map([["context", "UserTracker directory refresh error"]]));
        }

        if (!this.hasPendingPush()) {
          break;
        }
      }
    } finally {
      this.pushInProgress = false;
      if (this.hasPendingPush()) {
        this.queueDirectoryPush();
      }
    }
  }

  private async refreshAndBroadcastIfChanged(): Promise<void> {
    const stored = await this.loadState();
    const userId = stored.state?.userId;
    if (userId == null) {
      return;
    }

    const previousPayload = stored.viewState == null ? null : this.serializeDirectory(stored.viewState.directory);
    const nextDirectory = await this.buildDirectory(userId);
    const nextPayload = this.serializeDirectory(nextDirectory);
    await this.storeDirectoryState(userId, nextDirectory);

    if (previousPayload == null || nextPayload !== previousPayload) {
      this.webSocketAdapter.broadcast(this.state, nextPayload);
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + FOLLOW_WS_POLL_INTERVAL_MS);
  }

  private serializeDirectory(directory: TrackerDirectory): string {
    return userTrackerDirectoryMessageContract.serialize({
      type: "directory",
      directory,
    });
  }

  private hasPendingPush(): boolean {
    return this.pendingPush;
  }
}
