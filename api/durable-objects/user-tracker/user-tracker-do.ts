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
  type TrackerChangedPayload,
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
import { fetchTrackerDoViewState, toTrackerView } from "../../individual-tracker/mapper";
import type { DatabaseService } from "../../services/database/database";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type { IndividualTrackerService } from "../../services/individual-tracker/individual-tracker";
import { installServices as installServicesImpl } from "../../services/install";
import type { LogService } from "../../services/log/types";
import { emptyTrackerDirectory, type UserTrackerInternalState } from "./types";

const USER_TRACKER_STATE_KEY = "userTrackerState";
const USER_TRACKER_MARKERS_KEY = "userTrackerMarkers";
const FOLLOW_WS_POLL_INTERVAL_MS = 3000;
const USER_TRACKER_RECONCILE_INTERVAL_MS = 30000;
const TRACKER_MARKER_LIMIT = 500;

function isNonStopped(row: IndividualTrackersRow): boolean {
  return row.Status !== "stopped";
}

function isTrackerMarkerEntry(value: unknown): value is [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }

  return typeof value[0] === "string" && typeof value[1] === "string";
}

function toUpdateTimeMs(value: string): number | null {
  const parsedValue = Date.parse(value);
  if (Number.isNaN(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function normalizeStatsHighlightSlots(statsHighlightSlots: readonly string[] | undefined): readonly string[] {
  if (statsHighlightSlots == null) {
    return DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);
  }

  return statsHighlightSlots;
}

function statsHighlightSlotsAreEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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
  private pushCompletionPromise: Promise<void> | null = null;
  private resolvePushCompletion: (() => void) | null = null;
  private trackerSubscriptionsInstalled = false;
  private readonly dirtyTrackerIds = new Set<string>();
  private readonly trackerUpdateMarkers = new Map<string, string>();
  private trackerUpdateMarkersHydrated = false;
  private trackerUpdateMarkersHydrationPromise: Promise<void> | null = null;
  private trackerMarkerPersistenceChain: Promise<void> = Promise.resolve();

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
      await this.stopUpdateLoop();
    }

    return Promise.resolve();
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    this.logService.warn(error, new Map([["context", "UserTracker: WebSocket error"]]));
    return Promise.resolve();
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "UserTrackerDO");
      Sentry.setTag("method", "alarm");

      const hasConnectedClients = this.state.getWebSockets().length > 0;
      if (!hasConnectedClients) {
        const stored = await this.loadState();
        if (stored.state?.userId == null) {
          await this.stopUpdateLoop({ scheduleReconcile: false, stored });
          return;
        }

        await this.stopUpdateLoop({ scheduleReconcile: false, stored });
      }

      const tickType = hasConnectedClients ? "follow" : "reconcile";
      this.logService.debug(
        `UserTracker ${tickType} tick`,
        new Map([["hasConnectedClients", hasConnectedClients.toString()]]),
      );

      try {
        await this.queueDirectoryPush();
      } catch (error) {
        const stored = await this.loadState();
        this.logService.error(
          error,
          new Map([
            ["context", "UserTracker alarm error"],
            ["userId", stored.state?.userId ?? "unknown"],
            ["tickType", tickType],
            ["hasConnectedClients", hasConnectedClients.toString()],
          ]),
        );
        Sentry.captureException(error);
      }

      await this.scheduleNextAlarm(
        hasConnectedClients ? FOLLOW_WS_POLL_INTERVAL_MS : USER_TRACKER_RECONCILE_INTERVAL_MS,
      );
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
    if (stored?.state?.userId != null && this.state.getWebSockets().length === 0) {
      await this.scheduleReconcileAlarmIfNeeded();
    }

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

    const payload = parsedBody.data;
    const shouldAcceptNudge = await this.shouldAcceptNudge(payload);
    if (!shouldAcceptNudge) {
      return userTrackerNudgeContract.toResponse({ success: true }, { noStore: true });
    }

    const shouldQueuePushForNudge = await this.shouldQueuePushForNudge(payload);
    if (!shouldQueuePushForNudge) {
      return userTrackerNudgeContract.toResponse({ success: true }, { noStore: true });
    }

    void this.queueDirectoryPush();
    return userTrackerNudgeContract.toResponse({ success: true }, { noStore: true });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const stored = await this.getOrBuildState(request);
    if (stored?.state?.userId == null) {
      return new Response("Missing userId", { status: 400 });
    }

    const directory = stored.viewState?.directory ?? emptyTrackerDirectory;
    const payload = this.serializeDirectory(directory);
    await this.ensureUpdateLoopStarted();
    const response = this.webSocketAdapter.upgrade(this.state, payload);
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
    const normalizedUserId = userId?.trim();
    if (normalizedUserId == null || normalizedUserId === "") {
      return null;
    }

    return normalizedUserId;
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

  private async ensureUpdateLoopStarted(): Promise<void> {
    await this.scheduleNextAlarm(FOLLOW_WS_POLL_INTERVAL_MS);

    if (this.trackerSubscriptionsInstalled) {
      return;
    }

    this.trackerSubscriptionsInstalled = true;
    void this.installTrackerSubscriptionsAsync();
  }

  private async stopUpdateLoop(
    options: { scheduleReconcile: boolean; stored?: UserTrackerInternalState } = { scheduleReconcile: true },
  ): Promise<void> {
    this.closeTrackerSubscriptions();
    this.closeTrackerSubscriptions = (): void => {
      // reset after closing
    };
    this.trackerSubscriptionsInstalled = false;

    const stored = options.stored ?? (await this.loadState());
    if (stored.state?.userId == null) {
      await this.state.storage.deleteAlarm();
      return;
    }

    if (!options.scheduleReconcile) {
      return;
    }

    await this.scheduleReconcileAlarmIfNeeded();
  }

  private async scheduleReconcileAlarmIfNeeded(): Promise<void> {
    const nextAlarmTime = await this.state.storage.getAlarm();
    if (nextAlarmTime != null) {
      return;
    }

    await this.scheduleNextAlarm(USER_TRACKER_RECONCILE_INTERVAL_MS);
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
      this.trackerSubscriptionsInstalled = false;
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
              void this.queueDirectoryPush();
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

  private async queueDirectoryPush(): Promise<void> {
    if (this.pushInProgress) {
      this.pendingPush = true;
      return this.getOrCreatePushCompletionPromise();
    }

    this.pushInProgress = true;
    const pushCompletionPromise = this.getOrCreatePushCompletionPromise();
    void this.queueDirectoryPushAsync();
    return pushCompletionPromise;
  }

  private async queueDirectoryPushAsync(): Promise<void> {
    let shouldContinueWithQueuedPush = false;

    try {
      await this.drainPendingPushes();
    } finally {
      this.pushInProgress = false;
      shouldContinueWithQueuedPush = this.hasPendingPush();
      if (!shouldContinueWithQueuedPush) {
        const resolve = this.resolvePushCompletion;
        this.resolvePushCompletion = null;
        this.pushCompletionPromise = null;
        resolve?.();
      }
    }

    if (shouldContinueWithQueuedPush) {
      await this.queueDirectoryPush();
    }
  }

  private async drainPendingPushes(): Promise<void> {
    this.pendingPush = true;

    while (this.pendingPush) {
      this.pendingPush = false;
      const dirtyTrackerCountAtRefreshStart = this.dirtyTrackerIds.size;

      try {
        await this.refreshAndBroadcastIfChanged();
      } catch (error) {
        const stored = await this.loadState();
        const refreshMode = dirtyTrackerCountAtRefreshStart === 0 || stored.viewState == null ? "full" : "incremental";
        this.logService.error(
          error,
          new Map([
            ["context", "UserTracker directory refresh error"],
            ["userId", stored.state?.userId ?? "unknown"],
            ["refreshMode", refreshMode],
            ["dirtyTrackerCount", dirtyTrackerCountAtRefreshStart.toString()],
          ]),
        );
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
    const dirtyTrackerIds = this.consumeDirtyTrackerIds();
    let nextDirectory: TrackerDirectory;
    try {
      if (dirtyTrackerIds.size === 0 || stored.viewState == null) {
        nextDirectory = await this.buildDirectory(userId);
      } else {
        nextDirectory = await this.buildDirectoryWithDirtyTrackers(userId, stored.viewState.directory, dirtyTrackerIds);
      }
    } catch (error) {
      this.restoreDirtyTrackerIds(dirtyTrackerIds);
      throw error;
    }

    const nextPayload = this.serializeDirectory(nextDirectory);
    await this.storeDirectoryState(userId, nextDirectory);

    if (previousPayload == null || nextPayload !== previousPayload) {
      this.webSocketAdapter.broadcast(this.state, nextPayload);
    }
  }

  private async scheduleNextAlarm(intervalMs: number): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + intervalMs);
  }

  private async shouldAcceptNudge(payload: TrackerChangedPayload): Promise<boolean> {
    const stored = await this.loadState();
    const storedUserId = stored.state?.userId;
    if (storedUserId == null || storedUserId === payload.userId) {
      return true;
    }

    this.logService.warn(
      "UserTracker nudge ignored due to user mismatch",
      new Map([
        ["context", "UserTracker nudge ignored"],
        ["storedUserId", storedUserId],
        ["payloadUserId", payload.userId],
        ["trackerId", payload.trackerId],
      ]),
    );
    return false;
  }

  private async shouldQueuePushForNudge(payload: TrackerChangedPayload): Promise<boolean> {
    await this.hydrateTrackerUpdateMarkers();

    const markerKey = `${payload.userId}:${payload.trackerId}`;
    const previousMarker = this.trackerUpdateMarkers.get(markerKey);
    if (previousMarker != null && this.isStaleOrDuplicateMarker(payload.lastUpdateTime, previousMarker)) {
      return false;
    }

    // Refresh insertion order for existing keys so frequently-updated trackers are not evicted first.
    this.trackerUpdateMarkers.delete(markerKey);
    this.trackerUpdateMarkers.set(markerKey, payload.lastUpdateTime);
    this.markTrackerDirty(payload.trackerId);
    this.enforceTrackerMarkerLimit();
    await this.persistTrackerUpdateMarkers();
    return true;
  }

  private markTrackerDirty(trackerId: string): void {
    this.dirtyTrackerIds.add(trackerId);
  }

  private consumeDirtyTrackerIds(): Set<string> {
    if (this.dirtyTrackerIds.size === 0) {
      return new Set<string>();
    }

    const dirtyTrackerIds = new Set(this.dirtyTrackerIds);
    this.dirtyTrackerIds.clear();
    return dirtyTrackerIds;
  }

  private restoreDirtyTrackerIds(trackerIds: Set<string>): void {
    for (const trackerId of trackerIds) {
      this.dirtyTrackerIds.add(trackerId);
    }
  }

  private async buildDirectoryWithDirtyTrackers(
    userId: string,
    previousDirectory: TrackerDirectory,
    dirtyTrackerIds: Set<string>,
  ): Promise<TrackerDirectory> {
    const [allTrackers, streamerSettings] = await Promise.all([
      this.databaseService.findIndividualTrackersByUserId(userId),
      this.individualTrackerService.getSettingsForView(userId),
    ]);

    const nonStoppedRows = allTrackers.filter(isNonStopped);
    const rowsByTrackerId = new Map(nonStoppedRows.map((row) => [row.TrackerId, row]));
    const nextTrackersById = new Map(previousDirectory.trackers.map((tracker) => [tracker.trackerId, tracker]));

    for (const trackerId of nextTrackersById.keys()) {
      if (!rowsByTrackerId.has(trackerId)) {
        nextTrackersById.delete(trackerId);
      }
    }

    const trackerIdsToRefresh = new Set(dirtyTrackerIds);
    for (const trackerId of rowsByTrackerId.keys()) {
      if (!nextTrackersById.has(trackerId)) {
        trackerIdsToRefresh.add(trackerId);
      }
    }

    const previousStatsHighlightSlots = normalizeStatsHighlightSlots(
      previousDirectory.streamerSettings?.visibleSections?.statsHighlightSlots,
    );
    const nextStatsHighlightSlots = normalizeStatsHighlightSlots(streamerSettings.visibleSections?.statsHighlightSlots);
    if (!statsHighlightSlotsAreEqual(previousStatsHighlightSlots, nextStatsHighlightSlots)) {
      return await this.buildDirectory(userId);
    }

    const statsHighlightSlots = nextStatsHighlightSlots;

    const dirtyTrackerUpdates = await Promise.all(
      Array.from(trackerIdsToRefresh, async (trackerId) => {
        const row = rowsByTrackerId.get(trackerId);
        if (row == null) {
          return { trackerId, tracker: null };
        }

        const doState = await fetchTrackerDoViewState(this.env, row.UserId, row.TrackerId, statsHighlightSlots);
        return { trackerId, tracker: toTrackerView(row, doState) };
      }),
    );

    for (const update of dirtyTrackerUpdates) {
      if (update.tracker == null) {
        nextTrackersById.delete(update.trackerId);
        continue;
      }

      nextTrackersById.set(update.trackerId, update.tracker);
    }

    const entries = Array.from(nextTrackersById.values());
    const liveTracker = entries.find((entry) => entry.isLive);
    const firstActiveTracker = entries.find((entry) => entry.status === "active");
    const liveTrackerId = liveTracker?.trackerId ?? firstActiveTracker?.trackerId ?? null;

    return {
      trackers: entries,
      liveTrackerId,
      streamerSettings: Object.keys(streamerSettings).length > 0 ? streamerSettings : undefined,
    };
  }

  private isStaleOrDuplicateMarker(nextMarker: string, previousMarker: string): boolean {
    const nextMarkerMs = toUpdateTimeMs(nextMarker);
    const previousMarkerMs = toUpdateTimeMs(previousMarker);
    if (nextMarkerMs != null && previousMarkerMs != null) {
      return nextMarkerMs <= previousMarkerMs;
    }

    // If either marker is not parseable as a date, only exact duplicates are considered stale.
    return nextMarker === previousMarker;
  }

  private async hydrateTrackerUpdateMarkers(): Promise<void> {
    if (this.trackerUpdateMarkersHydrated) {
      return;
    }

    if (this.trackerUpdateMarkersHydrationPromise != null) {
      await this.trackerUpdateMarkersHydrationPromise;
      return;
    }

    this.trackerUpdateMarkersHydrationPromise = (async (): Promise<void> => {
      const storedEntries = await this.state.storage.get(USER_TRACKER_MARKERS_KEY);
      if (!Array.isArray(storedEntries)) {
        this.trackerUpdateMarkersHydrated = true;
        return;
      }

      for (const entry of storedEntries) {
        if (!isTrackerMarkerEntry(entry)) {
          continue;
        }

        const [markerKey, markerValue] = entry;

        this.trackerUpdateMarkers.set(markerKey, markerValue);
      }

      this.trackerUpdateMarkersHydrated = true;
    })().finally(() => {
      this.trackerUpdateMarkersHydrationPromise = null;
    });

    await this.trackerUpdateMarkersHydrationPromise;
  }

  private enforceTrackerMarkerLimit(): void {
    while (this.trackerUpdateMarkers.size > TRACKER_MARKER_LIMIT) {
      const oldestMarkerKey = this.trackerUpdateMarkers.keys().next().value;
      if (oldestMarkerKey == null) {
        break;
      }

      this.trackerUpdateMarkers.delete(oldestMarkerKey);
    }
  }

  private async persistTrackerUpdateMarkers(): Promise<void> {
    this.trackerMarkerPersistenceChain = this.trackerMarkerPersistenceChain
      .catch(() => {
        // previous persistence errors are already logged; keep chain alive
      })
      .then(async () => {
        const markerEntries = Array.from(this.trackerUpdateMarkers.entries());
        await this.state.storage.put(USER_TRACKER_MARKERS_KEY, markerEntries);
      })
      .catch((error: unknown) => {
        this.logService.warn(
          error,
          new Map([
            ["context", "UserTracker marker persistence error"],
            ["markerCount", this.trackerUpdateMarkers.size.toString()],
          ]),
        );
      });

    await this.trackerMarkerPersistenceChain;
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

  private async getOrCreatePushCompletionPromise(): Promise<void> {
    if (this.pushCompletionPromise != null) {
      return this.pushCompletionPromise;
    }

    this.pushCompletionPromise = new Promise<void>((resolve) => {
      this.resolvePushCompletion = resolve;
    });

    return this.pushCompletionPromise;
  }
}
