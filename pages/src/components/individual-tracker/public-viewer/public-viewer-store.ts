import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FONT_SIZES,
  DEFAULT_TICKER_SETTINGS,
} from "../../streamer-settings/shared-types";
import type { PublicViewerSnapshot, PublicViewerVariant } from "./types";

function createInitialSnapshot(
  xuid: string,
  variant: PublicViewerVariant,
  overlayViewPreview: boolean,
  overlayPreviewMode: "player" | "observer",
): PublicViewerSnapshot {
  return {
    xuid,
    variant,
    loading: true,
    availability: null,
    connectionStatus: "idle",
    errorMessage: null,
    trackerState: null,
    trackerSummary: null,
    matchHistory: null,
    matchHistoryLoading: false,
    renderModel: null,
    viewerTeamColor: "salmon",
    viewerEnemyColor: "cerulean",
    overlayShowTabs: true,
    overlayShowTicker: true,
    overlayShowTeamDetails: true,
    overlayViewPreview,
    overlayColorMode: overlayPreviewMode,
    overlayHasSeriesContext: false,
    overlaySeriesTitle: null,
    overlaySeriesSubtitle: null,
    overlaySeriesScore: "0:0",
    overlaySeriesTeams: [],
    overlaySeriesMatches: [],
    overlaySharedTabs: [],
    overlayTimelineTabIndexes: [],
    // Overlay-derived data
    overlayTabs: [],
    overlayAccumulatedStats: null,
    overlayTickerGroups: [],
    overlayTopBarStats: [],
    xuidToDiscordName: {},
    // Settings for overlay
    overlayShowMatchmakingStatsOnly: DEFAULT_TICKER_SETTINGS.showMatchmakingStatsOnly ?? false,
    overlaySelectedSlayerStats: DEFAULT_TICKER_SETTINGS.selectedSlayerStats,
    overlayShowObjectiveStats: DEFAULT_TICKER_SETTINGS.showObjectiveStats,
    overlayMedalRarityFilter: DEFAULT_TICKER_SETTINGS.medalRarityFilter,
    overlayShowPreSeriesInfo: DEFAULT_TICKER_SETTINGS.showPreSeriesInfo,
    overlayFontSizes: DEFAULT_FONT_SIZES,
    overlayShowTitle: DEFAULT_DISPLAY_SETTINGS.showTitle,
    overlayShowSubtitle: DEFAULT_DISPLAY_SETTINGS.showSubtitle,
    overlayShowScore: DEFAULT_DISPLAY_SETTINGS.showScore,
    overlayShowDiscordNames: DEFAULT_DISPLAY_SETTINGS.showDiscordNames,
    overlayShowXboxNames: DEFAULT_DISPLAY_SETTINGS.showXboxNames,
    overlayTopBarStatSlots: DEFAULT_DISPLAY_SETTINGS.topBarStatSlots,
  };
}

export class PublicViewerStore {
  public snapshot: PublicViewerSnapshot;
  public readonly subscribers = new Set<() => void>();

  public constructor(
    xuid: string,
    variant: PublicViewerVariant,
    overlayViewPreview = false,
    overlayPreviewMode: "player" | "observer" = "observer",
  ) {
    this.snapshot = createInitialSnapshot(xuid, variant, overlayViewPreview, overlayPreviewMode);
  }
}
