import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { TrackerSearchResult, TrackerMatchHistoryResponse } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerMatchCard,
  OverlayTab,
  OverlayAccumulatedStats,
  OverlayTickerGroup,
} from "../types";
import type {
  DisplaySettings,
  FontSizeSettings,
  IndividualTopBarStatOption,
  TickerSettings,
} from "../../streamer-settings/shared-types";
import type { IndividualTrackerTopBarStatItem } from "../top-bar-stats";

export type PublicViewerVariant = "view" | "overlay";

export type PublicViewerAvailability = "active" | "offline" | "not-found";

export interface PublicViewerOverlaySharedSeriesTab {
  readonly type: "series";
  readonly index: number;
  readonly label: string;
  readonly score: string;
  readonly teamColor: undefined;
}

export interface PublicViewerOverlaySharedTabIcon {
  readonly src: string;
  readonly dimmed: boolean;
}

export interface PublicViewerOverlaySharedMatchTab {
  readonly type: "match";
  readonly index: number;
  readonly matchId: string;
  readonly label: string;
  readonly score: string;
  readonly icon: string;
  readonly icons?: readonly PublicViewerOverlaySharedTabIcon[];
  readonly teamColor: string | undefined;
}

export type PublicViewerOverlaySharedTab = PublicViewerOverlaySharedSeriesTab | PublicViewerOverlaySharedMatchTab;

export interface PublicViewerSeriesTeam {
  readonly name: string;
  readonly players: readonly {
    readonly id: string;
    readonly displayName: string;
  }[];
}

export interface PublicViewerSnapshot {
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
  readonly loading: boolean;
  readonly availability: PublicViewerAvailability | null;
  readonly connectionStatus: "idle" | "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found";
  readonly errorMessage: string | null;
  readonly trackerState: IndividualTrackerState | null;
  readonly trackerSummary: TrackerSearchResult | null;
  readonly matchHistory: TrackerMatchHistoryResponse | null;
  readonly matchHistoryLoading: boolean;
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly viewerTeamColor: string;
  readonly viewerEnemyColor: string;
  readonly overlayShowTabs: boolean;
  readonly overlayShowTicker: boolean;
  readonly overlayShowTeamDetails: boolean;
  readonly overlayViewPreview: boolean;
  readonly overlayColorMode: "player" | "observer";
  readonly overlayHasSeriesContext: boolean;
  readonly overlaySeriesTitle: string | null;
  readonly overlaySeriesSubtitle: string | null;
  readonly overlaySeriesScore: string;
  readonly overlaySeriesTeams: readonly PublicViewerSeriesTeam[];
  readonly overlaySeriesMatches: readonly IndividualTrackerViewerMatchCard[];
  readonly overlaySharedTabs: readonly PublicViewerOverlaySharedTab[];
  readonly overlayTimelineTabIndexes: readonly number[];

  // Overlay-derived data
  readonly overlayTabs: readonly OverlayTab[];
  readonly overlayAccumulatedStats: OverlayAccumulatedStats | null;
  readonly overlayTickerGroups: readonly OverlayTickerGroup[];
  readonly overlayTopBarStats: readonly IndividualTrackerTopBarStatItem[];
  readonly xuidToDiscordName: Readonly<Record<string, string>>;

  // Settings for overlay
  readonly overlayShowMatchmakingStatsOnly: boolean;
  readonly overlaySelectedSlayerStats: TickerSettings["selectedSlayerStats"];
  readonly overlayShowObjectiveStats: TickerSettings["showObjectiveStats"];
  readonly overlayMedalRarityFilter: TickerSettings["medalRarityFilter"];
  readonly overlayShowPreSeriesInfo: TickerSettings["showPreSeriesInfo"];
  readonly overlayFontSizes: FontSizeSettings;
  readonly overlayShowTitle: DisplaySettings["showTitle"];
  readonly overlayShowSubtitle: DisplaySettings["showSubtitle"];
  readonly overlayShowScore: DisplaySettings["showScore"];
  readonly overlayShowDiscordNames: DisplaySettings["showDiscordNames"];
  readonly overlayShowXboxNames: DisplaySettings["showXboxNames"];
  readonly overlayTopBarStatSlots: readonly IndividualTopBarStatOption[];
}
