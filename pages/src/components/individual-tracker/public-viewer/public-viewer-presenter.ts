import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { StreamerViewStyleFlags } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { Services } from "../../../services/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerSubscription,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
  IndividualTrackerConnectionStatus,
} from "../../../services/individual-tracker/types";
import { buildIndividualTrackerViewerRenderModel } from "../viewer/viewer-render-model";
import type { PublicViewerSnapshot, PublicViewerVariant } from "./types";
import type { PublicViewerStore } from "./public-viewer-store";

interface PublicViewerPresenterConfig {
  readonly services: Services;
  readonly store: PublicViewerStore;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
}

export class PublicViewerPresenter {
  private readonly config: PublicViewerPresenterConfig;
  private isDisposed = false;
  private connection: IndividualTrackerConnection | null = null;
  private stateSubscription: IndividualTrackerSubscription | null = null;
  private statusSubscription: IndividualTrackerSubscription | null = null;
  private lastMatchHistoryKey: string | null = null;
  private lastSummaryGamertagKey: string | null = null;
  private matchHistory: TrackerMatchHistoryResponse | null = null;
  private medalMetadata: MedalMetadata = {};
  private trackerSummary: TrackerSearchResult | null = null;
  private streamerStyleFlags: StreamerViewStyleFlags = {};
  private resolvedColorMode: "player" | "observer" = "observer";

  public constructor(config: PublicViewerPresenterConfig) {
    this.config = config;
  }

  public start(): void {
    void this.initialize();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stateSubscription?.unsubscribe();
    this.stateSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  public subscribe(listener: () => void): () => void {
    this.config.store.subscribers.add(listener);
    return (): void => {
      this.config.store.subscribers.delete(listener);
    };
  }

  public getSnapshot(): PublicViewerSnapshot {
    return this.config.store.snapshot;
  }

  private updateSnapshot(updater: (snapshot: PublicViewerSnapshot) => PublicViewerSnapshot): void {
    if (this.isDisposed) {
      return;
    }

    const next = updater(this.config.store.snapshot);
    this.config.store.snapshot = {
      ...next,
      trackerSummary: this.trackerSummary,
      matchHistory: this.matchHistory,
      renderModel: buildIndividualTrackerViewerRenderModel({
        state: next.trackerState,
        matchHistory: this.matchHistory,
        medalMetadata: this.medalMetadata,
        defaultTeamColor: next.viewerTeamColor,
        defaultEnemyColor: next.viewerEnemyColor,
      }),
    };

    for (const subscriber of this.config.store.subscribers) {
      subscriber();
    }
  }

  private async initialize(): Promise<void> {
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      loading: true,
      errorMessage: null,
      connectionStatus: "connecting",
    }));

    try {
      const response = await this.config.services.individualTrackerService.getActiveTrackerView(this.config.xuid);
      this.streamerStyleFlags = response.streamerView?.styleFlags ?? {};
      this.resolvedColorMode = this.getOverlayColorMode(
        this.streamerStyleFlags,
        response.streamerView?.effectiveDefaults.colorMode,
      );
      const overlayShowTabs = response.streamerView?.visibleSections.showTabs ?? true;
      const overlayShowTicker = response.streamerView?.visibleSections.showTicker ?? true;
      const overlayShowTeamDetails = response.streamerView?.visibleSections.showTeamDetails ?? true;
      const viewerColors = this.getViewerColorsForState(response.activeTracker);

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerTeamColor: viewerColors.teamColor,
        viewerEnemyColor: viewerColors.enemyColor,
        overlayShowTabs,
        overlayShowTicker,
        overlayShowTeamDetails,
        overlayColorMode: this.resolvedColorMode,
        availability: response.status,
        trackerState: response.activeTracker,
        connectionStatus: response.activeTracker == null ? "idle" : snapshot.connectionStatus,
      }));

      if (response.activeTracker != null) {
        void this.refreshTrackerSummary(response.activeTracker.gamertag);
        void this.refreshMatchHistory(
          response.activeTracker.trackerId,
          response.activeTracker.xuid,
          response.activeTracker.matchIds,
        );
      }

      this.connectToActiveTracker();
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to load active tracker.",
        connectionStatus: "error",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, loading: false }));
    }
  }

  private connectToActiveTracker(): void {
    this.connection = this.config.services.individualTrackerService.connectToActiveTracker(this.config.xuid);

    this.stateSubscription = this.connection.subscribe((state) => {
      const viewerColors = this.getViewerColorsForState(state);
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        availability: "active",
        trackerState: state,
        connectionStatus: "connected",
        errorMessage: null,
        viewerTeamColor: viewerColors.teamColor,
        viewerEnemyColor: viewerColors.enemyColor,
      }));

      void this.refreshTrackerSummary(state.gamertag);
      void this.refreshMatchHistory(state.trackerId, state.xuid, state.matchIds);
    });

    this.statusSubscription = this.connection.subscribeStatus((status, detail) => {
      this.handleConnectionStatus(status, detail);
    });
  }

  private handleConnectionStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    this.updateSnapshot((snapshot) => {
      if (status === "not_found") {
        if (snapshot.availability !== "offline") {
          return {
            ...snapshot,
            availability: "not-found",
            connectionStatus: status,
            errorMessage: "No active tracker is currently available for this XUID.",
            trackerState: null,
          };
        }

        return {
          ...snapshot,
          connectionStatus: status,
        };
      }

      if (status === "error") {
        return {
          ...snapshot,
          connectionStatus: status,
          errorMessage: detail ?? "Tracker connection failed.",
        };
      }

      return {
        ...snapshot,
        connectionStatus: status,
      };
    });
  }

  private getViewerMatchHistoryKey(trackerId: string, matchIds: readonly string[]): string {
    return `${trackerId}:${matchIds.join(",")}`;
  }

  private async refreshTrackerSummary(gamertag: string): Promise<void> {
    const key = gamertag.trim().toLowerCase();
    if (key === "" || key === this.lastSummaryGamertagKey) {
      return;
    }

    this.lastSummaryGamertagKey = key;
    this.trackerSummary = null;
    this.updateSnapshot((snapshot) => ({ ...snapshot }));

    try {
      this.trackerSummary = await this.config.services.individualTrackerService.searchGamertag(gamertag);
      this.updateSnapshot((snapshot) => ({ ...snapshot }));
    } catch {
      this.trackerSummary = null;
      this.updateSnapshot((snapshot) => ({ ...snapshot }));
    }
  }

  private async refreshMatchHistory(trackerId: string, xuid: string, matchIds: readonly string[]): Promise<void> {
    const key = this.getViewerMatchHistoryKey(trackerId, matchIds);
    if (key === this.lastMatchHistoryKey) {
      return;
    }

    this.lastMatchHistoryKey = key;
    this.matchHistory = null;
    this.medalMetadata = {};

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      matchHistoryLoading: true,
    }));

    try {
      const history = await this.config.services.individualTrackerService.getMatchHistory(xuid, 0, 100);
      const rawMatches = history.matches
        .map((match) => match.rawMatchStats)
        .filter((match): match is NonNullable<typeof match> => match != null);
      const medalMetadata = await this.config.services.individualTrackerService.getMedalMetadata(rawMatches);

      this.matchHistory = history;
      this.medalMetadata = medalMetadata;

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        matchHistoryLoading: false,
      }));
    } catch (error) {
      this.matchHistory = null;
      this.medalMetadata = {};

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        matchHistoryLoading: false,
        errorMessage: error instanceof Error ? error.message : "Failed to load match history.",
      }));
    }
  }

  private normalizeColorId(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,32}$/.test(trimmed)) {
      return fallback;
    }

    return trimmed;
  }

  private getViewerColorsForState(state: IndividualTrackerState | null): {
    teamColor: string;
    enemyColor: string;
  } {
    const snapshot = this.getSnapshot();

    if (this.resolvedColorMode === "player" && state != null) {
      return {
        teamColor: this.normalizeColorId(
          this.streamerStyleFlags.playerTeamColor ?? this.streamerStyleFlags.teamColor ?? state.teamColor,
          snapshot.viewerTeamColor,
        ),
        enemyColor: this.normalizeColorId(
          this.streamerStyleFlags.playerEnemyColor ?? this.streamerStyleFlags.enemyColor ?? state.enemyColor,
          snapshot.viewerEnemyColor,
        ),
      };
    }

    const observerOverride =
      state == null ? null : (this.streamerStyleFlags.observerColorOverrides?.[state.trackerId] ?? null);

    return {
      teamColor: this.normalizeColorId(
        observerOverride?.teamColor ?? this.streamerStyleFlags.observerTeamColor ?? this.streamerStyleFlags.teamColor,
        snapshot.viewerTeamColor,
      ),
      enemyColor: this.normalizeColorId(
        observerOverride?.enemyColor ??
          this.streamerStyleFlags.observerEnemyColor ??
          this.streamerStyleFlags.enemyColor,
        snapshot.viewerEnemyColor,
      ),
    };
  }

  private getOverlayColorMode(
    styleFlags: StreamerViewStyleFlags,
    fallbackColorMode: "player" | "observer" | undefined,
  ): "player" | "observer" {
    if (styleFlags.colorMode === "player" || styleFlags.colorMode === "observer") {
      return styleFlags.colorMode;
    }

    if (fallbackColorMode === "player" || fallbackColorMode === "observer") {
      return fallbackColorMode;
    }

    return "observer";
  }
}
