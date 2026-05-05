import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { Services } from "../../../services/types";
import type { TrackerDisplayStatus, TrackerListItem, TrackerRowAction } from "../tracker-list/tracker-list";
import type {
  IndividualTrackerConnection,
  IndividualTrackerSubscription,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import type { GameSelectionDialogState } from "../types";
import { buildIndividualTrackerTrackerViewPath } from "../routes";
import { buildSeriesGroupKey } from "../series-group-metadata";
import type { LiveTrackersStore } from "./live-trackers-store";
import type { LiveTrackersSnapshot } from "./types";

interface Config {
  readonly services: Services;
  readonly store: LiveTrackersStore;
  readonly confirmDelete?: (message: string) => boolean;
  readonly navigateTo?: (url: string) => void;
}

const NON_LIVE_POLL_INTERVAL_MS = 30_000;

function getSyncableSeriesGroups(
  selectedMatchIds: readonly string[],
  matchGroupings: readonly (readonly string[])[],
  seriesGroups: NonNullable<IndividualTrackerState["seriesGroups"]>,
): readonly NonNullable<IndividualTrackerState["seriesGroups"]>[number][] {
  const selectedMatchIdSet = new Set(selectedMatchIds);
  const syncableGroupingKeys = new Set(
    matchGroupings
      .map((group) => group.filter((matchId) => selectedMatchIdSet.has(matchId)))
      .filter((group) => group.length >= 2)
      .map((group) => buildSeriesGroupKey(group)),
  );

  return seriesGroups.filter((seriesGroup) => syncableGroupingKeys.has(buildSeriesGroupKey(seriesGroup.matchIds)));
}

function derivedStatus(trackerState: IndividualTrackerState | null): TrackerDisplayStatus {
  if (trackerState === null) {
    return "not-started";
  }

  return trackerState.status;
}

export class LiveTrackersPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private storeUnsubscribe: (() => void) | null = null;
  private connection: IndividualTrackerConnection | null = null;
  private connectionSubscription: IndividualTrackerSubscription | null = null;
  private statusSubscription: IndividualTrackerSubscription | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private liveConnectionKey: string | null = null;
  private pollingUserId: string | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
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

  public setSessionContext(userId: string, xboxGamertag: string | null): void {
    this.updateSnapshot((snapshot) => ({ ...snapshot, userId, xboxGamertag }));
  }

  public resetForUnauthenticated(): void {
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      userId: null,
      xboxGamertag: null,
      activeTracker: null,
      runningTrackers: [],
      trackerStatuses: {},
      busy: false,
      errorMessage: null,
      isAddDialogOpen: false,
      gameSelectionDialogState: null,
    }));
  }

  public openAddDialog(): void {
    this.updateSnapshot((snapshot) => ({ ...snapshot, isAddDialogOpen: true }));
  }

  public closeAddDialog(): void {
    this.updateSnapshot((snapshot) => (snapshot.busy ? snapshot : { ...snapshot, isAddDialogOpen: false }));
  }

  public closeGameSelectionDialog(): void {
    this.updateSnapshot((snapshot) => (snapshot.busy ? snapshot : { ...snapshot, gameSelectionDialogState: null }));
  }

  public getTrackerItems(): readonly TrackerListItem[] {
    const snapshot = this.getSnapshot();
    const rows: TrackerListItem[] = [];

    const pinnedRuntimeTracker =
      snapshot.xboxGamertag == null
        ? null
        : (snapshot.runningTrackers.find(
            (tracker) => tracker.gamertag.toLowerCase() === snapshot.xboxGamertag?.toLowerCase(),
          ) ?? null);

    if (snapshot.xboxGamertag != null) {
      const pinnedState =
        pinnedRuntimeTracker != null ? (snapshot.trackerStatuses[pinnedRuntimeTracker.trackerId] ?? null) : null;

      rows.push({
        trackerId: pinnedRuntimeTracker?.trackerId ?? null,
        gamertag: snapshot.xboxGamertag,
        status: pinnedState != null ? derivedStatus(pinnedState) : "not-started",
        isLive:
          pinnedRuntimeTracker != null
            ? pinnedRuntimeTracker.trackerId === snapshot.activeTracker?.trackerId
            : snapshot.activeTracker == null,
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
        status: trackerState != null ? derivedStatus(trackerState) : "stopped",
        isLive: tracker.trackerId === snapshot.activeTracker?.trackerId,
        isPinned: false,
      });
    }

    return rows;
  }

  public getActions(item: TrackerListItem): readonly TrackerRowAction[] {
    const snapshot = this.getSnapshot();
    const trackerItems = this.getTrackerItems();
    const hasMultipleTrackers = trackerItems.length > 1;
    const actions: TrackerRowAction[] = [];
    const { status, gamertag, isLive, trackerId, isPinned } = item;

    if ((status === "not-started" || status === "stopped") && gamertag !== "") {
      actions.push({
        label: "Start tracker",
        disabled: snapshot.busy,
        onClick: (): void => {
          void this.startTracker(gamertag !== snapshot.xboxGamertag ? gamertag : undefined);
        },
      });
    }

    if (hasMultipleTrackers && !isLive) {
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
    }

    actions.push({
      label: "Game selection",
      disabled: snapshot.busy || status !== "active" || trackerId == null,
      onClick: (): void => {
        this.openGameSelection(item);
      },
    });

    actions.push({
      label: "Streamer settings",
      disabled: true,
      onClick: (): void => {
        // Phase 5: wire streamer settings overrides.
      },
    });

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

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    return this.config.services.individualTrackerService.searchGamertag(query);
  }

  public async loadMatches(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse> {
    return this.config.services.individualTrackerService.getMatchHistory(xuid, start, count);
  }

  public async addTracker(payload: {
    readonly gamertag: string;
    readonly selectedMatchIds: readonly string[];
    readonly matchGroupings: readonly (readonly string[])[];
    readonly seriesGroups?: IndividualTrackerState["seriesGroups"];
    readonly matches: TrackerMatchHistoryResponse["matches"];
  }): Promise<void> {
    const state = await this.startTracker(payload.gamertag);
    if (state == null) {
      return;
    }

    const seriesGroups = getSyncableSeriesGroups(
      payload.selectedMatchIds,
      payload.matchGroupings,
      payload.seriesGroups ?? [],
    );

    if (payload.selectedMatchIds.length > 0) {
      await this.config.services.individualTrackerService.syncMatchesToTracker({
        trackerId: state.trackerId,
        selectedMatchIds: payload.selectedMatchIds,
        matchGroupings: payload.matchGroupings,
        matches: payload.matches,
      });

      for (const seriesGroup of seriesGroups) {
        if (seriesGroup.matchIds.length < 2) {
          continue;
        }

        await this.config.services.individualTrackerService.updateSeriesGroup({
          trackerId: state.trackerId,
          matchIds: seriesGroup.matchIds,
          titleOverride: seriesGroup.titleOverride,
          subtitleOverride: seriesGroup.subtitleOverride,
        });
      }
    }

    this.updateSnapshot((snapshot) => ({ ...snapshot, isAddDialogOpen: false }));
    await this.refresh();
  }

  public async syncGameSelection(payload: {
    readonly trackerId: string;
    readonly selectedMatchIds: readonly string[];
    readonly matchGroupings: readonly (readonly string[])[];
    readonly seriesGroups?: IndividualTrackerState["seriesGroups"];
    readonly matches: TrackerMatchHistoryResponse["matches"];
  }): Promise<void> {
    const dialogState = this.getSnapshot().gameSelectionDialogState;
    const baselineIds = dialogState?.initialSelectedMatchIds ?? [];
    const baselineGroupings = dialogState?.initialGroupings ?? [];
    const baselineSeriesGroups = dialogState?.initialSeriesGroups ?? [];
    const selectedMatchIds = [...payload.selectedMatchIds];
    const seriesGroups = getSyncableSeriesGroups(
      payload.selectedMatchIds,
      payload.matchGroupings,
      payload.seriesGroups ?? [],
    );
    const hasSelectionChanged =
      baselineIds.length !== selectedMatchIds.length ||
      baselineIds.some((matchId, index) => selectedMatchIds[index] !== matchId);
    const hasGroupingChanged =
      baselineGroupings.length !== payload.matchGroupings.length ||
      baselineGroupings.some(
        (group, groupIndex) =>
          group.length !== (payload.matchGroupings[groupIndex]?.length ?? -1) ||
          group.some((matchId, matchIndex) => payload.matchGroupings[groupIndex]?.[matchIndex] !== matchId),
      );
    const baselineSeriesGroupsByKey = new Map(
      baselineSeriesGroups.map((group) => [buildSeriesGroupKey(group.matchIds), group]),
    );
    const hasSeriesGroupsChanged = seriesGroups.some((group) => {
      const baselineGroup = baselineSeriesGroupsByKey.get(buildSeriesGroupKey(group.matchIds));
      return (
        (baselineGroup?.titleOverride ?? null) !== group.titleOverride ||
        (baselineGroup?.subtitleOverride ?? null) !== group.subtitleOverride
      );
    });

    if (!hasSelectionChanged && !hasGroupingChanged && !hasSeriesGroupsChanged) {
      return;
    }

    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      if (hasSelectionChanged || hasGroupingChanged) {
        await this.config.services.individualTrackerService.syncMatchesToTracker({
          trackerId: payload.trackerId,
          selectedMatchIds: payload.selectedMatchIds,
          matchGroupings: payload.matchGroupings,
          matches: payload.matches,
        });
      }

      if (hasSeriesGroupsChanged || hasGroupingChanged) {
        for (const seriesGroup of seriesGroups) {
          await this.config.services.individualTrackerService.updateSeriesGroup({
            trackerId: payload.trackerId,
            matchIds: seriesGroup.matchIds,
            titleOverride: seriesGroup.titleOverride,
            subtitleOverride: seriesGroup.subtitleOverride,
          });
        }
      }

      await this.refresh();
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to sync game selection.",
      }));
      throw error;
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  public async refresh(): Promise<void> {
    const snapshot = this.getSnapshot();
    if (snapshot.userId == null) {
      this.resetForUnauthenticated();
      return;
    }

    try {
      const [trackerListResponse, activeStatusResponse] = await Promise.all([
        this.config.services.individualTrackerService.getTrackers(snapshot.userId),
        this.config.services.individualTrackerService.getActiveTrackerState(snapshot.userId),
      ]);

      this.updateSnapshot((current) => ({
        ...current,
        activeTracker: activeStatusResponse.activeTracker,
        runningTrackers: trackerListResponse.trackers.map((tracker) => ({
          trackerId: tracker.trackerId,
          gamertag: tracker.gamertag,
        })),
        trackerStatuses: trackerListResponse.statuses,
      }));
    } catch (error) {
      this.updateSnapshot((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to load individual tracker.",
      }));
    }
  }

  private updateSnapshot(updater: (snapshot: LiveTrackersSnapshot) => LiveTrackersSnapshot): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.snapshot = updater(this.config.store.snapshot);
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
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

      if (snapshot.userId != null && snapshot.activeTracker != null) {
        this.setupConnection(snapshot.userId, snapshot.activeTracker);
      }
    }

    if (snapshot.userId !== this.pollingUserId) {
      this.teardownPolling();

      if (snapshot.userId != null) {
        this.setupPolling(snapshot.userId);
      }
    }
  }

  private setupConnection(userId: string, activeTracker: IndividualTrackerState): void {
    this.liveConnectionKey = `${userId}:${activeTracker.trackerId}`;
    this.connection = this.config.services.individualTrackerService.connectToTracker(userId, activeTracker.trackerId);

    this.connectionSubscription = this.connection.subscribe((state) => {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: state,
        trackerStatuses: { ...snapshot.trackerStatuses, [state.trackerId]: state },
      }));
    });

    this.statusSubscription = this.connection.subscribeStatus((status) => {
      if (status !== "stopped") {
        return;
      }

      this.updateSnapshot((snapshot) => {
        const liveTrackerId = activeTracker.trackerId;
        const existing = snapshot.trackerStatuses[liveTrackerId] ?? null;

        return {
          ...snapshot,
          activeTracker: snapshot.activeTracker == null ? null : { ...snapshot.activeTracker, status: "stopped" },
          trackerStatuses:
            existing == null
              ? snapshot.trackerStatuses
              : { ...snapshot.trackerStatuses, [liveTrackerId]: { ...existing, status: "stopped" } },
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
  }

  private setupPolling(userId: string): void {
    this.pollingUserId = userId;
    this.pollingInterval = setInterval(() => {
      void this.pollNonLiveTrackers(userId);
    }, NON_LIVE_POLL_INTERVAL_MS);
  }

  private teardownPolling(): void {
    if (this.pollingInterval != null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.pollingUserId = null;
  }

  private async pollNonLiveTrackers(userId: string): Promise<void> {
    const snapshot = this.getSnapshot();
    const activeId = snapshot.activeTracker?.trackerId ?? null;
    const hasNonLive = snapshot.runningTrackers.some((tracker) => tracker.trackerId !== activeId);

    if (!hasNonLive) {
      return;
    }

    const response = await this.config.services.individualTrackerService.getTrackers(userId);
    this.updateSnapshot((current) => ({
      ...current,
      runningTrackers: response.trackers.map((tracker) => ({
        trackerId: tracker.trackerId,
        gamertag: tracker.gamertag,
      })),
      trackerStatuses: { ...current.trackerStatuses, ...response.statuses },
    }));
  }

  private async startTracker(gamertag?: string): Promise<IndividualTrackerState | null> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      const result = await this.config.services.individualTrackerService.startTracker({
        idleTimeoutHours: 1,
        ...(gamertag != null ? { gamertag } : {}),
      });

      if (!result.success) {
        this.updateSnapshot((snapshot) => ({ ...snapshot, errorMessage: result.error }));
        return null;
      }

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: result.state,
        trackerStatuses: { ...snapshot.trackerStatuses, [result.state.trackerId]: result.state },
      }));

      await this.refresh();
      return result.state;
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to start tracker.",
      }));
      return null;
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private async stopTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      const result = await this.config.services.individualTrackerService.stopTracker(trackerId);
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: result.state,
        trackerStatuses: { ...snapshot.trackerStatuses, [result.state.trackerId]: result.state },
      }));
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to stop tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private async pauseTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      const result = await this.config.services.individualTrackerService.pauseTracker(trackerId);
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: snapshot.activeTracker?.trackerId === trackerId ? result.state : snapshot.activeTracker,
        trackerStatuses: { ...snapshot.trackerStatuses, [result.state.trackerId]: result.state },
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to pause tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private async resumeTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      const result = await this.config.services.individualTrackerService.resumeTracker(trackerId);
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: snapshot.activeTracker?.trackerId === trackerId ? result.state : snapshot.activeTracker,
        trackerStatuses: { ...snapshot.trackerStatuses, [result.state.trackerId]: result.state },
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to resume tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private async selectLiveTracker(trackerId: string): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      await this.config.services.individualTrackerService.selectLiveTracker(trackerId);
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to set live tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private async deleteTracker(trackerId: string): Promise<void> {
    const confirmDelete = this.config.confirmDelete ?? ((message: string): boolean => window.confirm(message));
    if (!confirmDelete("Delete this tracker? This cannot be undone.")) {
      return;
    }

    this.updateSnapshot((snapshot) => ({ ...snapshot, busy: true, errorMessage: null }));

    try {
      await this.config.services.individualTrackerService.deleteTracker(trackerId);
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        activeTracker: snapshot.activeTracker?.trackerId === trackerId ? null : snapshot.activeTracker,
      }));
      await this.refresh();
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to delete tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, busy: false }));
    }
  }

  private openGameSelection(item: TrackerListItem): void {
    if (item.trackerId == null) {
      return;
    }

    const snapshot = this.getSnapshot();
    const trackerState =
      snapshot.trackerStatuses[item.trackerId] ??
      (snapshot.activeTracker?.trackerId === item.trackerId ? snapshot.activeTracker : null);

    if (trackerState == null) {
      this.updateSnapshot((current) => ({
        ...current,
        errorMessage: "Unable to load tracker state for game selection.",
      }));
      return;
    }

    const gameSelectionDialogState: GameSelectionDialogState = {
      trackerId: item.trackerId,
      trackerLabel: item.gamertag,
      xuid: trackerState.xuid,
      initialSelectedMatchIds: [...trackerState.matchIds],
      initialGroupings: trackerState.matchGroupings,
      initialSeriesGroups: trackerState.seriesGroups,
    };

    this.updateSnapshot((current) => ({ ...current, gameSelectionDialogState }));
  }
}
