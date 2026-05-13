import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type {
  StreamerViewStyleFlags,
  StreamerViewVisibleSections,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import { GameVariantCategory, type MatchStats } from "halo-infinite-api";
import type { ImageMetadata } from "astro";
import attritionPng from "../../../assets/game-modes/attrition.png";
import captureTheFlagPng from "../../../assets/game-modes/capture-the-flag.png";
import eliminationPng from "../../../assets/game-modes/elimination.png";
import strongholdsPng from "../../../assets/game-modes/strongholds.png";
import oddballPng from "../../../assets/game-modes/oddball.png";
import slayerPng from "../../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../../assets/game-modes/king-of-the-hill.png";
import assaultPng from "../../../assets/game-modes/assault.png";
import totalControlPng from "../../../assets/game-modes/total-control.png";
import extractionPng from "../../../assets/game-modes/extraction.png";
import stockpilePng from "../../../assets/game-modes/stockpile.png";
import infectionPng from "../../../assets/game-modes/infection.png";
import landGrabPng from "../../../assets/game-modes/land-grab.png";
import firefightPng from "../../../assets/game-modes/firefight.png";
import vipPng from "../../../assets/game-modes/vip.png";
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
  OverlayTickerGroup,
  OverlayTickerRow,
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerTimelineItem,
  IndividualTrackerViewerMatchCard,
} from "../types";
import { getTeamColor } from "../../team-colors/team-colors";
import {
  ALL_SLAYER_STATS,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FONT_SIZES,
  DEFAULT_TICKER_SETTINGS,
  normalizeIndividualTopBarStatOption,
} from "../../streamer-settings/shared-types";
import type { DisplaySettings } from "../../streamer-settings/shared-types";
import { buildIndividualTrackerTopBarStats, type IndividualTrackerTopBarStatItem } from "../top-bar-stats";
import type { PublicViewerStore } from "./public-viewer-store";
import type {
  PublicViewerOverlaySharedTab,
  PublicViewerSeriesTeam,
  PublicViewerSnapshot,
  PublicViewerVariant,
} from "./types";

interface PublicViewerPresenterConfig {
  readonly services: Services;
  readonly store: PublicViewerStore;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
  readonly forcedOverlayColorMode?: "player" | "observer" | undefined;
}

interface ResolvedOverlayContext {
  readonly hasSeriesContext: boolean;
  readonly seriesTitle: string | null;
  readonly seriesSubtitle: string | null;
  readonly seriesScore: string;
  readonly seriesTeams: readonly PublicViewerSeriesTeam[];
  readonly seriesMatches: readonly IndividualTrackerViewerMatchCard[];
  readonly sharedTabs: readonly PublicViewerOverlaySharedTab[];
  readonly timelineTabIndexes: readonly number[];
}

function gameModeIconUrl(gameVariantCategory: GameVariantCategory, gameMode: string): ImageMetadata {
  switch (gameVariantCategory) {
    case GameVariantCategory.MultiplayerAttrition: {
      return attritionPng;
    }
    case GameVariantCategory.MultiplayerElimination: {
      return eliminationPng;
    }
    case GameVariantCategory.MultiplayerStrongholds: {
      return strongholdsPng;
    }
    case GameVariantCategory.MultiplayerKingOfTheHill: {
      return kingOfTheHillPng;
    }
    case GameVariantCategory.MultiplayerTotalControl: {
      return totalControlPng;
    }
    case GameVariantCategory.MultiplayerCtf: {
      return captureTheFlagPng;
    }
    case GameVariantCategory.MultiplayerExtraction: {
      return extractionPng;
    }
    case GameVariantCategory.MultiplayerOddball: {
      return oddballPng;
    }
    case GameVariantCategory.MultiplayerStockpile: {
      return stockpilePng;
    }
    case GameVariantCategory.MultiplayerInfection: {
      return infectionPng;
    }
    case GameVariantCategory.MultiplayerVIP: {
      return vipPng;
    }
    case GameVariantCategory.MultiplayerLandGrab: {
      return landGrabPng;
    }
    case GameVariantCategory.MultiplayerMinigame: {
      if (gameMode.includes("Bomb") || gameMode.includes("Assault")) {
        return assaultPng;
      }
      return slayerPng;
    }
    case GameVariantCategory.MultiplayerFirefight: {
      return firefightPng;
    }
    case GameVariantCategory.MultiplayerFiesta: {
      if (gameMode.includes("Total Control")) {
        return totalControlPng;
      }
      if (gameMode.toLowerCase().includes("flag") || gameMode.toLowerCase().includes("ctf")) {
        return captureTheFlagPng;
      }
      return slayerPng;
    }
    case GameVariantCategory.MultiplayerEscalation:
    case GameVariantCategory.MultiplayerGrifball:
    case GameVariantCategory.MultiplayerSlayer:
    default: {
      return slayerPng;
    }
  }
}

function parseLeadingScorePair(score: string): { left: number; right: number } | null {
  const match = /(\d+)\s*:\s*(\d+)/.exec(score);
  if (match == null) {
    return null;
  }

  const left = parseInt(match[1], 10);
  const right = parseInt(match[2], 10);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }

  return { left, right };
}

function getTrackedTeamIdForMatch(
  matchStats: IndividualTrackerViewerMatchCard["matchStats"],
  trackedGamertag: string | null,
): number | null {
  if (matchStats == null || trackedGamertag == null || trackedGamertag === "") {
    return null;
  }

  const normalizedTrackedGamertag = trackedGamertag.trim().toLowerCase();

  for (const team of matchStats) {
    if (team.players.some((player) => player.name.trim().toLowerCase() === normalizedTrackedGamertag)) {
      return team.teamId;
    }
  }

  return null;
}

function getWinningTeamIdForMatch(matchStats: IndividualTrackerViewerMatchCard["matchStats"]): number | null {
  if (matchStats == null || matchStats.length === 0) {
    return null;
  }

  let winningTeamId: number | null = null;
  let winningScore = Number.NEGATIVE_INFINITY;
  let tieDetected = false;

  for (const team of matchStats) {
    const scoreStat = team.teamStats.find((stat) => stat.name.toLowerCase() === "score");
    const score = scoreStat?.value;
    if (score == null) {
      continue;
    }

    if (score > winningScore) {
      winningScore = score;
      winningTeamId = team.teamId;
      tieDetected = false;
    } else if (score === winningScore) {
      tieDetected = true;
    }
  }

  if (tieDetected) {
    return null;
  }

  return winningTeamId;
}

function getTrackedTeamIndexInSeriesGroup(
  teams: readonly { readonly players: readonly { readonly content: string }[] }[],
  trackedGamertag: string | null,
): number | null {
  if (trackedGamertag == null || trackedGamertag.trim() === "") {
    return null;
  }

  const normalizedTrackedGamertag = trackedGamertag.trim().toLowerCase();

  for (const [teamIndex, team] of teams.entries()) {
    const hasTrackedPlayer = team.players.some(
      (player) => player.content.trim().toLowerCase() === normalizedTrackedGamertag,
    );

    if (hasTrackedPlayer) {
      return teamIndex;
    }
  }

  return null;
}

function getSeriesMatchTabLabel(match: { readonly gameTypeAndMap: string; readonly gameMode: string }): string {
  const gameTypeAndMap = match.gameTypeAndMap.trim();

  const colonIndex = gameTypeAndMap.indexOf(":");
  if (colonIndex >= 0 && colonIndex < gameTypeAndMap.length - 1) {
    return gameTypeAndMap.slice(colonIndex + 1).trim();
  }

  const onSeparator = " on ";
  const onIndex = gameTypeAndMap.toLowerCase().indexOf(onSeparator);
  if (onIndex >= 0 && onIndex < gameTypeAndMap.length - onSeparator.length) {
    return gameTypeAndMap.slice(onIndex + onSeparator.length).trim();
  }

  if (gameTypeAndMap !== "") {
    return gameTypeAndMap;
  }

  return match.gameMode;
}

function toCompactSeriesScore(score: string): string {
  return score.replace(/^(Win|Loss|Tie|DNF|Unknown)\s*-\s*/i, "").trim();
}

function getWinnerRelativeSeriesTabColor(
  teamColorId: string,
  enemyColorId: string,
  trackedGamertag: string | null,
  match: {
    readonly score: string;
    readonly matchStats: IndividualTrackerViewerMatchCard["matchStats"];
  },
): string | undefined {
  const teamColor = getTeamColor(teamColorId)?.hex;
  const enemyColor = getTeamColor(enemyColorId)?.hex;
  const outcomePrefixMatch = /^(Win|Loss|Tie|DNF|Unknown)\s*-\s*/i.exec(match.score);
  const outcomePrefix = outcomePrefixMatch?.[1]?.toLowerCase();

  if (outcomePrefix === "win") {
    return teamColor;
  }

  if (outcomePrefix === "loss") {
    return enemyColor;
  }

  const trackedTeamId = getTrackedTeamIdForMatch(match.matchStats, trackedGamertag);
  const scorePair = parseLeadingScorePair(match.score);
  if (trackedTeamId != null && scorePair != null && scorePair.left !== scorePair.right) {
    const trackedTeamWon = trackedTeamId === 0 ? scorePair.left > scorePair.right : scorePair.right > scorePair.left;
    return trackedTeamWon ? teamColor : enemyColor;
  }

  const winningTeamId = getWinningTeamIdForMatch(match.matchStats);
  if (trackedTeamId == null || winningTeamId == null) {
    return undefined;
  }

  return trackedTeamId === winningTeamId ? teamColor : enemyColor;
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
    const resolvedOverlayContext = this.resolveOverlayContext(next, renderModel, overlayTabs, overlayAccumulatedStats);

    const overlaySettings = this.extractOverlaySettings();
    const overlayTopBarStats: readonly IndividualTrackerTopBarStatItem[] = buildIndividualTrackerTopBarStats({
      renderModel,
      trackerSummary: this.trackerSummary,
      topBarStatSlots: overlaySettings.topBarStatSlots,
    });
    const overlayTickerGroups =
      renderModel == null ? [] : this.computeOverlayTickerGroups(renderModel, overlaySettings);

    this.config.store.snapshot = {
      ...next,
      trackerSummary: this.trackerSummary,
      matchHistory: this.matchHistory,
      renderModel,
      overlayTabs,
      overlayAccumulatedStats,
      overlayTickerGroups,
      overlayTopBarStats,
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
      overlayHasSeriesContext: resolvedOverlayContext.hasSeriesContext,
      overlaySeriesTitle: resolvedOverlayContext.seriesTitle,
      overlaySeriesSubtitle: resolvedOverlayContext.seriesSubtitle,
      overlaySeriesScore: resolvedOverlayContext.seriesScore,
      overlaySeriesTeams: resolvedOverlayContext.seriesTeams,
      overlaySeriesMatches: resolvedOverlayContext.seriesMatches,
      overlaySharedTabs: resolvedOverlayContext.sharedTabs,
      overlayTimelineTabIndexes: resolvedOverlayContext.timelineTabIndexes,
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
      this.resolvedColorMode =
        this.config.forcedOverlayColorMode ??
        this.getOverlayColorMode(this.streamerStyleFlags, response.streamerView?.effectiveDefaults.colorMode);
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

  private resolveOverlayContext(
    snapshot: PublicViewerSnapshot,
    renderModel: IndividualTrackerViewerRenderModel | null,
    overlayTabs: readonly OverlayTab[],
    overlayAccumulatedStats: OverlayAccumulatedStats | null,
  ): ResolvedOverlayContext {
    if (renderModel == null) {
      return {
        hasSeriesContext: false,
        seriesTitle: null,
        seriesSubtitle: null,
        seriesScore: "0:0",
        seriesTeams: [],
        seriesMatches: [],
        sharedTabs: [],
        timelineTabIndexes: [],
      };
    }

    const activeSeries = renderModel.activeNeatQueueSeries;
    const lastTimelineItem = renderModel.gameplayTimeline.at(-1) ?? null;
    const latestGroupedSeries = lastTimelineItem?.type === "group" ? lastTimelineItem : null;
    const isNeatQueueSeriesActive = activeSeries != null && snapshot.trackerState?.status !== "stopped";
    const hasSeriesContext = isNeatQueueSeriesActive || latestGroupedSeries != null;
    const seriesMatches = latestGroupedSeries?.matches ?? [];
    const seriesTeams: readonly PublicViewerSeriesTeam[] =
      activeSeries?.teams.map((team) => ({
        name: team.name,
        players: team.players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
        })),
      })) ??
      latestGroupedSeries?.teams.map((team, teamIndex) => ({
        name: team.name,
        players: team.players.map((player, playerIndex) => ({
          id: `${teamIndex.toString()}-${playerIndex.toString()}-${player.content}`,
          displayName: player.content,
        })),
      })) ??
      [];

    const wins = overlayAccumulatedStats?.wins ?? 0;
    const losses = overlayAccumulatedStats?.losses ?? 0;
    const primaryTab: PublicViewerOverlaySharedTab = {
      type: "series",
      index: -1,
      label: hasSeriesContext ? "Series score" : "Matches",
      score: activeSeries?.seriesScore ?? latestGroupedSeries?.seriesScore ?? `${wins.toString()}:${losses.toString()}`,
      teamColor: undefined,
    };

    const timelineTabs = overlayTabs.filter((tab) => tab.type !== "active-series");
    const timelineTabIndexes = timelineTabs
      .map((tab) => tab.timelineIndex)
      .filter((timelineIndex): timelineIndex is number => timelineIndex != null);

    const timelineSharedTabs: PublicViewerOverlaySharedTab[] = timelineTabs.map((tab, index) => {
      const timelineItem = tab.timelineIndex == null ? null : (renderModel.gameplayTimeline[tab.timelineIndex] ?? null);
      const score = timelineItem?.type === "match" ? timelineItem.match.score : "";
      const icon =
        timelineItem?.type === "match"
          ? gameModeIconUrl(timelineItem.match.gameVariantCategory, timelineItem.match.gameMode).src
          : "";

      return {
        type: "match",
        index,
        matchId: tab.id,
        label: tab.label,
        score,
        icon,
        teamColor: tab.teamColor,
      };
    });

    if (hasSeriesContext) {
      const trackedTeamColor = getTeamColor(snapshot.viewerTeamColor)?.hex;
      const enemyTeamColor = getTeamColor(snapshot.viewerEnemyColor)?.hex;
      const trackedGamertag = snapshot.trackerState?.gamertag ?? null;
      const trackedTeamIndex =
        latestGroupedSeries == null
          ? null
          : getTrackedTeamIndexInSeriesGroup(latestGroupedSeries.teams, trackedGamertag);

      const seriesSharedTabs: PublicViewerOverlaySharedTab[] = seriesMatches.map((match, index) => {
        const winningTeamIndex = latestGroupedSeries?.overviewMatches[index]?.winningTeamIndex;
        const winnerRelativeColor =
          winningTeamIndex != null && trackedTeamIndex != null
            ? winningTeamIndex === trackedTeamIndex
              ? trackedTeamColor
              : enemyTeamColor
            : getWinnerRelativeSeriesTabColor(snapshot.viewerTeamColor, snapshot.viewerEnemyColor, trackedGamertag, {
                score: match.score,
                matchStats: match.matchStats,
              });

        return {
          type: "match",
          index,
          matchId: match.id,
          label: getSeriesMatchTabLabel(match),
          score: toCompactSeriesScore(match.score),
          icon: gameModeIconUrl(match.gameVariantCategory, match.gameMode).src,
          teamColor: winnerRelativeColor,
        };
      });

      return {
        hasSeriesContext,
        seriesTitle: activeSeries?.title ?? latestGroupedSeries?.title ?? null,
        seriesSubtitle: activeSeries?.subtitle ?? latestGroupedSeries?.subtitle ?? null,
        seriesScore: primaryTab.score,
        seriesTeams,
        seriesMatches,
        sharedTabs: [primaryTab, ...seriesSharedTabs],
        timelineTabIndexes,
      };
    }

    return {
      hasSeriesContext,
      seriesTitle: null,
      seriesSubtitle: null,
      seriesScore: primaryTab.score,
      seriesTeams,
      seriesMatches,
      sharedTabs: [primaryTab, ...timelineSharedTabs],
      timelineTabIndexes,
    };
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
          label: item.match.map,
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
    const visibleSectionsRecord = visibleSections as Record<string, unknown>;

    const topBarStatSlots = (visibleSections.topBarStatSlots ?? DEFAULT_DISPLAY_SETTINGS.topBarStatSlots)
      .map((value) => normalizeIndividualTopBarStatOption(value))
      .filter((value): value is DisplaySettings["topBarStatSlots"][number] => value != null)
      .slice(0, DEFAULT_DISPLAY_SETTINGS.topBarStatSlots.length);

    return {
      showMatchmakingStatsOnly:
        typeof visibleSectionsRecord.showMatchmakingStatsOnly === "boolean"
          ? visibleSectionsRecord.showMatchmakingStatsOnly
          : (DEFAULT_TICKER_SETTINGS.showMatchmakingStatsOnly ?? false),
      selectedSlayerStats: this.isStringArray(visibleSections.selectedSlayerStats)
        ? visibleSections.selectedSlayerStats
        : DEFAULT_TICKER_SETTINGS.selectedSlayerStats,
      showObjectiveStats:
        typeof visibleSections.showObjectiveStats === "boolean"
          ? visibleSections.showObjectiveStats
          : DEFAULT_TICKER_SETTINGS.showObjectiveStats,
      medalRarityFilter: this.isNumberArray(visibleSections.medalRarityFilter)
        ? visibleSections.medalRarityFilter
        : DEFAULT_TICKER_SETTINGS.medalRarityFilter,
      showPreSeriesInfo:
        typeof visibleSections.showPreSeriesInfo === "boolean"
          ? visibleSections.showPreSeriesInfo
          : DEFAULT_TICKER_SETTINGS.showPreSeriesInfo,
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

  private computeOverlayTickerGroups(
    renderModel: IndividualTrackerViewerRenderModel,
    overlaySettings: {
      readonly showMatchmakingStatsOnly: boolean;
      readonly selectedSlayerStats: readonly string[];
      readonly showObjectiveStats: boolean;
      readonly medalRarityFilter: readonly number[];
    },
  ): readonly OverlayTickerGroup[] {
    const groups: OverlayTickerGroup[] = [];

    const filterStats = (stats: OverlayTickerRow["stats"]): OverlayTickerRow["stats"] => {
      return stats.filter((stat) => {
        if (overlaySettings.selectedSlayerStats.includes(stat.name)) {
          return true;
        }

        if (overlaySettings.showObjectiveStats) {
          return !(ALL_SLAYER_STATS as readonly string[]).includes(stat.name);
        }

        return false;
      });
    };

    const difficultyRange = new Map<number, readonly [number, number]>([
      [0, [0, 99]],
      [1, [100, 149]],
      [2, [150, 199]],
      [3, [200, Number.POSITIVE_INFINITY]],
    ]);

    const includeMedalByRarity = (sortingWeight: number): boolean => {
      for (const [difficultyIndex, [minWeight, maxWeight]] of difficultyRange.entries()) {
        if (sortingWeight >= minWeight && sortingWeight <= maxWeight) {
          return overlaySettings.medalRarityFilter.includes(difficultyIndex);
        }
      }

      return false;
    };

    // Build ticker groups from timeline matches
    for (let itemIndex = 0; itemIndex < renderModel.gameplayTimeline.length; itemIndex++) {
      const item = renderModel.gameplayTimeline[itemIndex];

      if (item.type === "match") {
        const { match } = item;
        if (match.matchStats == null || match.matchStats.length === 0) {
          continue;
        }

        const rows: OverlayTickerRow[] = [];

        // Build rows for each team's stats
        for (const teamStats of match.matchStats) {
          // Add team row with team stats and medals
          rows.push({
            type: "team",
            name: `Team ${String(teamStats.teamId)}`,
            teamId: teamStats.teamId,
            stats: filterStats(
              teamStats.teamStats.map((stat) => ({
                name: stat.name,
                value: stat.value,
                display: stat.display,
                bestInTeam: stat.bestInTeam,
                bestInMatch: stat.bestInMatch,
              })),
            ),
            medals: teamStats.teamMedals
              .filter((medal) => includeMedalByRarity(medal.sortingWeight))
              .map((medal) => ({
                name: medal.name,
                count: medal.count,
                imageUrl: "",
              })),
          });

          // Add player rows for this team
          for (const player of teamStats.players) {
            rows.push({
              type: "player",
              name: player.name,
              teamId: teamStats.teamId,
              stats: filterStats(
                player.values.map((stat) => ({
                  name: stat.name,
                  value: stat.value,
                  display: stat.display,
                  bestInTeam: stat.bestInTeam,
                  bestInMatch: stat.bestInMatch,
                })),
              ),
              medals: player.medals
                .filter((medal) => includeMedalByRarity(medal.sortingWeight))
                .map((medal) => ({
                  name: medal.name,
                  count: medal.count,
                  imageUrl: "",
                })),
            });
          }
        }

        if (rows.length > 0) {
          groups.push({
            matchIndex: itemIndex,
            label: match.gameTypeAndMap,
            rows,
          });
        }
      }
    }

    return groups;
  }

  private isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }

  private isNumberArray(value: unknown): value is readonly number[] {
    return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
  }
}
