import type { TrackerState, TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { TrackerLiveView } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type {
  IndividualTrackerConnection,
  IndividualTrackerService,
  IndividualTrackerSubscription,
} from "../../../services/individual-tracker/types";
import { buildIndividualTrackerTrackerViewPath } from "../../individual-tracker/routes";
import type { GameSelectionDialogState, ManualSeriesDialogState } from "../types";
import type { TrackerDisplayStatus, TrackerListItem, TrackerRowAction } from "../tracker-list/tracker-list";
import type { LiveTrackersStore } from "./live-trackers-store";
import type { LiveTrackersSnapshot } from "./types";

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly store: LiveTrackersStore;
  readonly confirmDelete?: ((message: string) => boolean) | undefined;
  readonly navigateTo?: ((url: string) => void) | undefined;
}

const NON_LIVE_POLL_INTERVAL_MS = 30_000;

function derivedStatus(status: TrackerStatus | undefined): TrackerDisplayStatus {
  if (status == null) {
    return "not-started";
  }
  return status;
}

export class LiveTrackersPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private storeUnsubscribe: (() => void) | null = null;
  private connection: IndividualTrackerConnection | null = null;
  private connectionSubscription: IndividualTrackerSubscription | null = null;
  private statusSubscription: IndividualTrackerSubscription | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private pollingUserId: string | null = null;
  private liveConnectionKey: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight = false;
  private activeLiveView: TrackerLiveView | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    this.isDisposed = false;
    this.storeUnsubscribe = this.subscribe(() => {
      this.syncRuntimeDependencies();
    });
    this.syncRuntimeDependencies();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.teardownConnection();
    this.teardownPolling();
    if (this.reconnectTimeout != null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  public subscribe(listener: () => void): () => void {
    this.config.store.subscribers.add(listener);
    return (): void => {
      this.config.store.subscribers.delete(listener);
    };
  }

  public getSnapshot(): LiveTrackersSnapshot {
    return this.config.store.snapshot;
  }

  public setSessionContext(userId: string, xboxGamertag: string | null, xboxXuid: string | null): void {
    this.updateSnapshot((s) => ({ ...s, userId, xboxGamertag, xboxXuid }));
  }

  public resetForUnauthenticated(): void {
    this.updateSnapshot((s) => ({
      ...s,
      userId: null,
      xboxGamertag: null,
      xboxXuid: null,
      activeTracker: null,
      runningTrackers: [],
      trackerStatuses: {},
      busy: false,
      errorMessage: null,
      isAddDialogOpen: false,
      gameSelectionDialogState: null,
      manualSeriesDialogState: null,
    }));
  }

  public openAddDialog(): void {
    this.updateSnapshot((s) => ({ ...s, isAddDialogOpen: true }));
  }

  public closeAddDialog(): void {
    this.updateSnapshot((s) => (s.busy ? s : { ...s, isAddDialogOpen: false }));
  }

  public closeGameSelectionDialog(): void {
    this.updateSnapshot((s) => (s.busy ? s : { ...s, gameSelectionDialogState: null }));
  }

  public closeManualSeriesDialog(): void {
    this.updateSnapshot((s) => (s.busy ? s : { ...s, manualSeriesDialogState: null }));
  }

  public getTrackerItems(): readonly TrackerListItem[] {
    const snapshot = this.getSnapshot();
    const rows: TrackerListItem[] = [];

    const pinnedRuntimeTracker =
      snapshot.xboxGamertag == null
        ? null
        : (snapshot.runningTrackers.find((t) => t.gamertag.toLowerCase() === snapshot.xboxGamertag?.toLowerCase()) ??
          null);

    if (snapshot.xboxGamertag != null) {
      const pinnedState =
        pinnedRuntimeTracker != null ? (snapshot.trackerStatuses[pinnedRuntimeTracker.trackerId] ?? null) : null;
      rows.push({
        trackerId: pinnedRuntimeTracker?.trackerId ?? null,
        gamertag: snapshot.xboxGamertag,
        status: pinnedState != null ? derivedStatus(pinnedState.status) : "not-started",
        isLive: pinnedRuntimeTracker != null && pinnedRuntimeTracker.trackerId === snapshot.activeTracker?.trackerId,
        isPinned: true,
      });
    }

    for (const tracker of snapshot.runningTrackers) {
      if (pinnedRuntimeTracker?.trackerId === tracker.trackerId) {
        continue;
      }
      const trackerState = snapshot.trackerStatuses[tracker.trackerId] ?? null;
      rows.push({
        trackerId: tracker.trackerId,
        gamertag: tracker.gamertag,
        status: trackerState != null ? derivedStatus(trackerState.status) : "stopped",
        isLive: tracker.trackerId === snapshot.activeTracker?.trackerId,
        isPinned: false,
      });
    }

    return rows;
  }

  public getActions(item: TrackerListItem): readonly TrackerRowAction[] {
    const snapshot = this.getSnapshot();
    const trackerItems = this.getTrackerItems();
    const { status, gamertag, isLive, trackerId, isPinned } = item;
    const actions: TrackerRowAction[] = [];

    if ((status === "not-started" || status === "stopped") && gamertag !== "") {
      actions.push({
        label: "Start tracker",
        disabled: snapshot.busy,
        onClick: (): void => {
          void this.startTracker(gamertag !== snapshot.xboxGamertag ? gamertag : undefined);
        },
      });
    }

    if (trackerItems.length > 1 && !isLive) {
      actions.push({
        label: "Set as live",
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.selectLiveTracker(trackerId);
          }
        },
      });
    }

    if (trackerId != null) {
      actions.push({
        label: "View tracker",
        onClick: (): void => {
          this.navigateTo(buildIndividualTrackerTrackerViewPath(trackerId));
        },
      });
    }

    if (status === "active") {
      actions.push({
        label: "Pause",
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.pauseTracker(trackerId);
          }
        },
      });
    }

    if (status === "paused") {
      actions.push({
        label: "Resume",
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.resumeTracker(trackerId);
          }
        },
      });
    }

    if (status === "active" || status === "paused") {
      actions.push({
        label: "Stop tracker",
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.stopTracker(trackerId);
          }
        },
      });
      actions.push({
        label: "End series",
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.endSeries(trackerId);
          }
        },
      });
    }

    if (status === "active" && trackerId != null) {
      actions.push({
        label: "Game selection",
        disabled: snapshot.busy,
        onClick: (): void => {
          this.openGameSelection(item);
        },
      });
      actions.push({
        label: "Start series",
        disabled: snapshot.busy,
        onClick: (): void => {
          this.openManualSeriesDialog(item);
        },
      });
    }

    if (!isPinned) {
      actions.push({
        label: "Delete tracker",
        destructive: true,
        disabled: snapshot.busy || trackerId == null,
        onClick: (): void => {
          if (trackerId != null) {
            void this.deleteTracker(trackerId);
          }
        },
      });
    }

    return actions;
  }

  public async refresh(): Promise<void> {
    const snapshot = this.getSnapshot();
    if (snapshot.userId == null) {
      this.resetForUnauthenticated();
      return;
    }

    this.refreshInFlight = true;
    try {
      const { trackers } = await this.config.individualTrackerService.listTrackers();
      const liveTracker = trackers.find((t) => t.isLive);

      this.updateSnapshot((current) => ({
        ...current,
        activeTracker: liveTracker?.state ?? null,
        runningTrackers: trackers.map((t) => ({ trackerId: t.trackerId, gamertag: t.gamertag })),
        trackerStatuses: Object.fromEntries<TrackerState | null>(trackers.map((t) => [t.trackerId, t.state ?? null])),
      }));
    } catch (error) {
      this.updateSnapshot((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to load individual tracker.",
      }));
    } finally {
      this.refreshInFlight = false;
    }
  }

  private updateSnapshot(updater: (snapshot: LiveTrackersSnapshot) => LiveTrackersSnapshot): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.snapshot = updater(this.config.store.snapshot);
    for (const subscriber of this.config.store.subscribers) {
      subscriber();
    }
  }

  private navigateTo(url: string): void {
    if (this.config.navigateTo != null) {
      this.config.navigateTo(url);
      return;
    }
    window.location.assign(`/individual-tracker${url}`);
  }

  private syncRuntimeDependencies(): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.getSnapshot();
    const nextConnectionKey =
      snapshot.userId != null && snapshot.activeTracker != null
        ? `${snapshot.userId}:${snapshot.activeTracker.trackerId}`
        : null;

    if (nextConnectionKey !== this.liveConnectionKey) {
      this.teardownConnection();
      // Don't reconnect while a backoff timer is pending — it will call syncRuntimeDependencies
      // itself when it fires.
      if (snapshot.userId != null && snapshot.activeTracker != null && this.reconnectTimeout == null) {
        this.setupConnection(snapshot.userId, snapshot.activeTracker.trackerId);
      }
    }

    if (snapshot.userId !== this.pollingUserId) {
      this.teardownPolling();
      if (snapshot.userId != null) {
        this.setupPolling(snapshot.userId);
      }
    }
  }

  private setupConnection(userId: string, trackerId: string): void {
    this.liveConnectionKey = `${userId}:${trackerId}`;
    this.connection = this.config.individualTrackerService.connectToTracker(userId, trackerId);

    this.connectionSubscription = this.connection.subscribe((view) => {
      this.activeLiveView = view;
      this.updateSnapshot((snapshot) => {
        const existing = snapshot.trackerStatuses[view.trackerId];
        if (existing == null) {
          return snapshot;
        }
        const updated = { ...existing, status: view.status };
        return {
          ...snapshot,
          activeTracker: snapshot.activeTracker?.trackerId === view.trackerId ? updated : snapshot.activeTracker,
          trackerStatuses: { ...snapshot.trackerStatuses, [view.trackerId]: updated },
        };
      });
    });

    this.statusSubscription = this.connection.subscribeStatus((status) => {
      if (status === "error" || status === "disconnected") {
        this.liveConnectionKey = null;
        this.teardownConnection();
        if (this.reconnectTimeout != null) {
          clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (!this.isDisposed) {
            this.syncRuntimeDependencies();
          }
        }, 3000);
        return;
      }
      if (status === "not_found") {
        this.liveConnectionKey = null;
        this.teardownConnection();
        void this.refresh();
        return;
      }
      if (status !== "stopped") {
        return;
      }
      // Null activeTracker so that if the same tracker is restarted, syncRuntimeDependencies
      // sees a key change and establishes a fresh WS connection.
      this.updateSnapshot((snapshot) => {
        const existing = snapshot.trackerStatuses[trackerId] ?? null;
        return {
          ...snapshot,
          activeTracker: null,
          trackerStatuses:
            existing == null
              ? snapshot.trackerStatuses
              : { ...snapshot.trackerStatuses, [trackerId]: { ...existing, status: "stopped" as TrackerStatus } },
        };
      });
    });
  }

  private teardownConnection(): void {
    this.connectionSubscription?.unsubscribe();
    this.connectionSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
    this.liveConnectionKey = null;
    this.activeLiveView = null;
  }

  private setupPolling(userId: string): void {
    this.pollingUserId = userId;
    this.pollingInterval = setInterval(() => {
      void this.pollNonLiveTrackers();
    }, NON_LIVE_POLL_INTERVAL_MS);
  }

  private teardownPolling(): void {
    if (this.pollingInterval != null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.pollingUserId = null;
  }

  private async pollNonLiveTrackers(): Promise<void> {
    const snapshot = this.getSnapshot();
    const activeId = snapshot.activeTracker?.trackerId ?? null;
    const hasNonLive = snapshot.runningTrackers.some((t) => t.trackerId !== activeId);
    if (!hasNonLive) {
      return;
    }

    try {
      const response = await this.config.individualTrackerService.getTrackers();
      this.updateSnapshot((current) => {
        const liveId = current.activeTracker?.trackerId ?? null;
        const mergedStatuses = { ...current.trackerStatuses };
        for (const [trackerId, status] of Object.entries(response.statuses)) {
          if (trackerId !== liveId) {
            mergedStatuses[trackerId] = status;
          }
        }
        return {
          ...current,
          // Skip runningTrackers update when a refresh() is in-flight — its result is
          // authoritative and a stale poll response would resurrect deleted trackers.
          ...(this.refreshInFlight
            ? {}
            : { runningTrackers: response.trackers.map((t) => ({ trackerId: t.trackerId, gamertag: t.gamertag })) }),
          trackerStatuses: mergedStatuses,
        };
      });
    } catch {
      // polling failures are silent
    }
  }

  private async startTracker(gamertag?: string): Promise<void> {
    const targetGamertag = gamertag ?? this.getSnapshot().xboxGamertag;
    if (targetGamertag == null) {
      return;
    }
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.startTracker({ idleTimeoutHours: 1, gamertag: targetGamertag });
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to start tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async stopTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.stopTracker(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to stop tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async pauseTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.pauseTracker(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to pause tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async resumeTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.resumeTracker(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to resume tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async endSeries(trackerId: string): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.endSeries(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to end series.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async selectLiveTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.selectActive(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to set live tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private async deleteTracker(trackerId: string): Promise<void> {
    const confirmDelete = this.config.confirmDelete ?? ((message: string): boolean => window.confirm(message));
    if (!confirmDelete("Delete this tracker? This cannot be undone.")) {
      return;
    }

    this.updateSnapshot((s) => ({ ...s, busy: true, errorMessage: null }));
    try {
      await this.config.individualTrackerService.deleteTracker(trackerId);
      this.updateSnapshot((s) => ({
        ...s,
        activeTracker: s.activeTracker?.trackerId === trackerId ? null : s.activeTracker,
      }));
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to delete tracker.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busy: false }));
    }
  }

  private openGameSelection(item: TrackerListItem): void {
    if (item.trackerId == null) {
      return;
    }
    const snapshot = this.getSnapshot();
    const trackerState = snapshot.trackerStatuses[item.trackerId] ?? null;
    if (trackerState == null) {
      this.updateSnapshot((s) => ({ ...s, errorMessage: "Unable to load tracker state for game selection." }));
      return;
    }

    const liveView = this.activeLiveView?.trackerId === item.trackerId ? this.activeLiveView : null;
    const dialogState: GameSelectionDialogState = {
      trackerId: item.trackerId,
      trackerLabel: item.gamertag,
      xuid: trackerState.xuid,
      initialSelectedMatchIds: liveView?.matches.map((m) => m.matchId) ?? [],
      initialGroupings: liveView?.series.map((s) => s.matchIds) ?? [],
      initialSeriesGroups: liveView?.series.map((s) => ({ matchIds: s.matchIds, titleOverride: null, subtitleOverride: null })) ?? [],
    };
    this.updateSnapshot((s) => ({ ...s, gameSelectionDialogState: dialogState }));
  }

  private openManualSeriesDialog(item: TrackerListItem): void {
    if (item.trackerId == null) {
      return;
    }
    const dialogState: ManualSeriesDialogState = {
      trackerId: item.trackerId,
      trackerLabel: item.gamertag,
    };
    this.updateSnapshot((s) => ({ ...s, manualSeriesDialogState: dialogState }));
  }
}
