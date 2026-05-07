import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type {
  StreamerViewStyleFlags,
  StreamerViewVisibleSections,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { MatchStats } from "halo-infinite-api";
import type { Services } from "../../../services/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerSubscription,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
  IndividualTrackerConnectionStatus,
} from "../../../services/individual-tracker/types";
import { buildIndividualTrackerViewerRenderModel } from "../viewer/viewer-render-model";
import type {
  OverlayTab,
  OverlayAccumulatedStats,
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerTimelineItem,
} from "../types";
import { getTeamColor } from "../../team-colors/team-colors";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FONT_SIZES,
  DEFAULT_TICKER_SETTINGS,
  isIndividualTopBarStatOption,
} from "../../streamer-settings/shared-types";
import type { DisplaySettings } from "../../streamer-settings/shared-types";
import type { PublicViewerStore } from "./public-viewer-store";
import type { PublicViewerSnapshot, PublicViewerVariant } from "./types";

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
  private streamerVisibleSections: StreamerViewVisibleSections = {};
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
    const renderModel = buildIndividualTrackerViewerRenderModel({
      state: next.trackerState,
      matchHistory: this.matchHistory,
      medalMetadata: this.medalMetadata,
      defaultTeamColor: next.viewerTeamColor,
      defaultEnemyColor: next.viewerEnemyColor,
    });

    const overlayTabs = renderModel == null ? [] : this.computeOverlayTabs(renderModel);
    const overlayAccumulatedStats = renderModel == null ? null : this.computeOverlayAccumulatedStats(renderModel);
    const xuidToDiscordName = this.extractXuidToDiscordName(next.trackerState);

    const overlaySettings = this.extractOverlaySettings();

    this.config.store.snapshot = {
      ...next,
      trackerSummary: this.trackerSummary,
      matchHistory: this.matchHistory,
      renderModel,
      overlayTabs,
      overlayAccumulatedStats,
      overlayTickerGroups: [], // Computed separately if needed
      xuidToDiscordName,
      overlayShowMatchmakingStatsOnly: overlaySettings.showMatchmakingStatsOnly,
      overlaySelectedSlayerStats: overlaySettings.selectedSlayerStats,
      overlayShowObjectiveStats: overlaySettings.showObjectiveStats,
      overlayMedalRarityFilter: overlaySettings.medalRarityFilter,
      overlayShowPreSeriesInfo: overlaySettings.showPreSeriesInfo,
      overlayFontSizes: overlaySettings.fontSizes,
      overlayShowTitle: overlaySettings.showTitle,
      overlayShowSubtitle: overlaySettings.showSubtitle,
      overlayShowScore: overlaySettings.showScore,
      overlayShowDiscordNames: overlaySettings.showDiscordNames,
      overlayShowXboxNames: overlaySettings.showXboxNames,
      overlayTopBarStatSlots: overlaySettings.topBarStatSlots,
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
      this.streamerVisibleSections = response.streamerView?.visibleSections ?? {};
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

  private computeOverlayTabs(renderModel: IndividualTrackerViewerRenderModel): readonly OverlayTab[] {
    const tabs: OverlayTab[] = [];
    const snapshot = this.getSnapshot();

    // If active NeatQueue series, emit single tab
    if (renderModel.activeNeatQueueSeries != null) {
      tabs.push({
        id: "series",
        label: "Series",
        type: "active-series",
        teamColor: this.computeWinnerRelativeColor(null, snapshot.viewerTeamColor, snapshot.viewerEnemyColor),
        timelineIndex: undefined,
      });
      return tabs;
    }

    // For each timeline item, create a tab with computed winner-relative color
    for (const [index, item] of renderModel.gameplayTimeline.entries()) {
      const teamColor = this.computeTimelineItemWinnerColor(item, snapshot.viewerTeamColor, snapshot.viewerEnemyColor);

      if (item.type === "group") {
        tabs.push({
          id: `group-${index.toString()}`,
          label: `Set ${(index + 1).toString()}`,
          type: "group",
          teamColor,
          timelineIndex: index,
        });
      } else {
        tabs.push({
          id: `standalone-${index.toString()}`,
          label: `Game ${(index + 1).toString()}`,
          type: "standalone",
          teamColor,
          timelineIndex: index,
        });
      }
    }

    return tabs;
  }

  private computeTimelineItemWinnerColor(
    item: IndividualTrackerViewerTimelineItem,
    teamColorId: string,
    enemyColorId: string,
  ): string | undefined {
    let lastMatch: MatchStats | null = null;

    if (item.type === "group") {
      // Get last match from group
      for (const matchCard of item.matches) {
        const matchData = this.matchHistory?.matches.find((m) => m.rawMatchStats?.MatchId === matchCard.id);
        if (matchData?.rawMatchStats != null) {
          lastMatch = matchData.rawMatchStats;
        }
      }
    } else {
      // Get standalone match
      const matchData = this.matchHistory?.matches.find((m) => m.rawMatchStats?.MatchId === item.match.id);
      if (matchData?.rawMatchStats != null) {
        lastMatch = matchData.rawMatchStats;
      }
    }

    if (lastMatch == null || this.config.store.snapshot.trackerState == null) {
      return undefined;
    }

    const playerXuid = this.config.store.snapshot.trackerState.xuid;
    const playerTeamIndex = this.getPlayerTeamIndex(lastMatch, playerXuid);
    const winningTeamIndex = this.getWinningTeamIndex(lastMatch);

    if (playerTeamIndex == null || winningTeamIndex == null) {
      return undefined;
    }

    return this.computeWinnerRelativeColor(playerTeamIndex === winningTeamIndex, teamColorId, enemyColorId);
  }

  private getPlayerTeamIndex(match: MatchStats, playerXuid: string): number | null {
    for (const player of match.Players) {
      const playerId = player.PlayerId;
      // Extract XUID from PlayerId (format: "xuid(12345678901)")
      const xuidMatch = /xuid\((\d+)\)/.exec(playerId);
      if (xuidMatch?.[1] === playerXuid) {
        return player.LastTeamId;
      }
    }
    return null;
  }

  private getWinningTeamIndex(match: MatchStats): number | null {
    for (const team of match.Teams) {
      // Outcome 2 = win
      if (team.Outcome === 2) {
        return team.TeamId;
      }
    }
    return null;
  }

  private computeWinnerRelativeColor(isWinner: boolean | null, teamColorId: string, enemyColorId: string): string {
    let colorId: string;

    if (isWinner === true) {
      colorId = teamColorId;
    } else if (isWinner === false) {
      colorId = enemyColorId;
    } else {
      colorId = teamColorId;
    }

    return getTeamColor(colorId)?.hex ?? "#00B7EB"; // Fallback to Halo blue
  }

  private computeOverlayAccumulatedStats(renderModel: IndividualTrackerViewerRenderModel): OverlayAccumulatedStats {
    const accStats = renderModel.accumulatedStats;

    return {
      wins: accStats.wins,
      losses: accStats.losses,
      total: accStats.total,
      matchmaking: accStats.matchmaking,
      custom: accStats.customOrLocal,
    };
  }

  private extractXuidToDiscordName(state: IndividualTrackerState | null): Readonly<Record<string, string>> {
    if (state?.activeNeatQueueSeries == null) {
      return {};
    }

    const mapping: Record<string, string> = {};
    for (const [xuid, playerData] of Object.entries(
      state.activeNeatQueueSeries.neatQueueSeriesData.playersAssociationData,
    )) {
      if (playerData.discordName !== "") {
        mapping[xuid] = playerData.discordName;
      }
    }

    return mapping;
  }

  private extractOverlaySettings(): {
    readonly showMatchmakingStatsOnly: boolean;
    readonly selectedSlayerStats: readonly string[];
    readonly showObjectiveStats: boolean;
    readonly medalRarityFilter: readonly number[];
    readonly showPreSeriesInfo: boolean;
    readonly fontSizes: typeof DEFAULT_FONT_SIZES;
    readonly showTitle: boolean;
    readonly showSubtitle: boolean;
    readonly showScore: boolean;
    readonly showDiscordNames: boolean;
    readonly showXboxNames: boolean;
    readonly topBarStatSlots: DisplaySettings["topBarStatSlots"];
  } {
    const visibleSections = this.streamerVisibleSections;

    const topBarStatSlots = (visibleSections.topBarStatSlots ?? DEFAULT_DISPLAY_SETTINGS.topBarStatSlots)
      .filter((value): value is DisplaySettings["topBarStatSlots"][number] => isIndividualTopBarStatOption(value))
      .slice(0, DEFAULT_DISPLAY_SETTINGS.topBarStatSlots.length);

    return {
      showMatchmakingStatsOnly: DEFAULT_TICKER_SETTINGS.showMatchmakingStatsOnly ?? false,
      selectedSlayerStats: DEFAULT_TICKER_SETTINGS.selectedSlayerStats,
      showObjectiveStats: DEFAULT_TICKER_SETTINGS.showObjectiveStats,
      medalRarityFilter: DEFAULT_TICKER_SETTINGS.medalRarityFilter,
      showPreSeriesInfo: DEFAULT_TICKER_SETTINGS.showPreSeriesInfo,
      fontSizes: DEFAULT_FONT_SIZES,
      showTitle: visibleSections.showTitle ?? DEFAULT_DISPLAY_SETTINGS.showTitle,
      showSubtitle: visibleSections.showSubtitle ?? DEFAULT_DISPLAY_SETTINGS.showSubtitle,
      showScore: visibleSections.showScore ?? DEFAULT_DISPLAY_SETTINGS.showScore,
      showDiscordNames: visibleSections.showDiscordNames ?? DEFAULT_DISPLAY_SETTINGS.showDiscordNames,
      showXboxNames: visibleSections.showXboxNames ?? DEFAULT_DISPLAY_SETTINGS.showXboxNames,
      topBarStatSlots:
        topBarStatSlots.length === DEFAULT_DISPLAY_SETTINGS.topBarStatSlots.length
          ? topBarStatSlots
          : DEFAULT_DISPLAY_SETTINGS.topBarStatSlots,
    };
  }
}
