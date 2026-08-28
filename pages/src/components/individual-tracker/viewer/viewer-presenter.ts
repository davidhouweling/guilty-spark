import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { withStreamerViewSettingsDefaults } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewSubscription,
} from "../../../services/individual-tracker/view-types";
import { getReconnectDelayMs } from "../../../services/base/reconnect-policy";
import { EntryDetailController } from "./entry-detail-controller";
import { buildViewerRenderModel } from "./viewer-render-model";
import type { IndividualTrackerViewerSnapshot, IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel, ViewerTimelineItem } from "./types";

interface Config {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly store: IndividualTrackerViewerStore;
  readonly trackerId: string;
}

export class IndividualTrackerViewerPresenter {
  private readonly config: Config;
  private readonly entryDetailController: EntryDetailController;
  private isDisposed = false;
  private connection: TrackerViewConnection | null = null;
  private viewSubscription: TrackerViewSubscription | null = null;
  private statusSubscription: TrackerViewSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private awaitingRefresh = false;
  private streamerSettings: StreamerViewSettings | undefined;
  private streamerSettingsKey = "null";
  private hasServerStreamerSettings = false;
  private modeVersion = 0;

  public constructor(config: Config) {
    this.config = config;
    this.entryDetailController = new EntryDetailController({
      store: config.store,
      seriesMatchesService: config.seriesMatchesService,
      matchAnalyticsService: config.matchAnalyticsService,
      medalMetadataResolver: config.medalMetadataResolver,
      trackerId: config.trackerId,
    });
  }

  public static present(snapshot: IndividualTrackerViewerSnapshot): IndividualTrackerViewerViewModel {
    const streamerSettings = withStreamerViewSettingsDefaults(snapshot.view?.streamerSettings);
    const { styleFlags } = streamerSettings;
    return {
      renderModel:
        snapshot.view == null
          ? null
          : buildViewerRenderModel({
              view: snapshot.view,
              preferredTeamColorId: styleFlags?.playerTeamColor ?? styleFlags?.teamColor,
              preferredEnemyColorId: styleFlags?.playerEnemyColor ?? styleFlags?.enemyColor,
            }),
      connectionStatus: snapshot.connectionStatus,
      refreshPending: snapshot.refreshPending,
      expandedEntryKeys: snapshot.expandedEntryKeys,
      entryStates: snapshot.entryStates,
      streamerSettings,
    };
  }

  public refresh(): void {
    // Refresh is only available in managed context.
    if (this.config.individualTrackerService == null) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.refreshPending || snapshot.view?.status !== "active") {
      return;
    }

    this.awaitingRefresh = true;
    this.config.store.setRefreshState(true);
    void this.refreshAsync();
  }

  public setStreamerSettings(streamerSettings: StreamerViewSettings | undefined): void {
    const nextKey = JSON.stringify(streamerSettings ?? null);
    if (nextKey === this.streamerSettingsKey) {
      return;
    }

    this.streamerSettings = streamerSettings;
    this.streamerSettingsKey = nextKey;

    if (this.hasServerStreamerSettings) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.view == null) {
      return;
    }

    this.config.store.setLoaded({ ...snapshot.view, streamerSettings: this.streamerSettings });
  }

  public setExternalView(view: TrackerViewState): void {
    this.modeVersion += 1;
    this.closeConnection();
    this.awaitingRefresh = false;
    this.config.store.setRefreshState(false);
    this.hasServerStreamerSettings = view.streamerSettings !== undefined;
    const resolvedView =
      view.streamerSettings === undefined && this.streamerSettings !== undefined
        ? { ...view, streamerSettings: this.streamerSettings }
        : view;
    this.config.store.setLoaded(resolvedView);
    this.config.store.setConnectionStatus("connected");
  }

  public toggleEntry(item: ViewerTimelineItem): void {
    this.entryDetailController.toggleEntry(item);
  }

  public start(): void {
    this.resetReconnectState();
    this.modeVersion += 1;
    const { modeVersion } = this;
    void this.load(modeVersion);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.entryDetailController.dispose();
    this.resetReconnectState();
    this.awaitingRefresh = false;
    this.closeConnection();
  }

  private resetReconnectState(): void {
    this.reconnectAttempt = 0;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null || this.isDisposed) {
      return;
    }

    const delay = getReconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.isDisposed) {
        return;
      }

      this.openConnection();
    }, delay);
  }

  private async refreshAsync(): Promise<void> {
    try {
      // Only refresh in managed context when individual tracker service is available.
      if (this.config.individualTrackerService == null) {
        return;
      }
      await this.config.individualTrackerService.refreshTracker(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.awaitingRefresh = false;
      this.config.store.setRefreshState(false);
    }
  }

  private async load(modeVersion: number): Promise<void> {
    this.config.store.setLoading();
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed || this.modeVersion !== modeVersion) {
        return;
      }
      this.hasServerStreamerSettings = response.view.streamerSettings !== undefined;
      const view =
        response.view.streamerSettings === undefined && this.streamerSettings !== undefined
          ? { ...response.view, streamerSettings: this.streamerSettings }
          : response.view;
      this.config.store.setLoaded(view);
      this.openConnection();
    } catch (error) {
      if (this.isDisposed || this.modeVersion !== modeVersion) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
    }
  }

  private openConnection(): void {
    this.closeConnection();

    const connection = this.config.individualTrackerViewService.connect(this.config.trackerId);
    this.connection = connection;
    this.viewSubscription = connection.subscribe((view) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setView(view);
      if (this.awaitingRefresh) {
        this.awaitingRefresh = false;
        this.config.store.setRefreshState(false);
      }
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }

      this.config.store.setConnectionStatus(status);

      if (status === "connected") {
        this.resetReconnectState();
        return;
      }

      if (status === "error" || status === "disconnected") {
        this.scheduleReconnect();
      }
    });
  }

  private closeConnection(): void {
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }
}
