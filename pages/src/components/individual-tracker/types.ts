import type {
  IndividualTrackerSeriesGroup,
  IndividualTrackerState,
} from "@guilty-spark/shared/individual-tracker/types";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { GameVariantCategory } from "halo-infinite-api";
import type { DisplaySettings, TickerSettings, FontSizeSettings } from "../live-tracker/settings/types";
import type { TrackerSearchResult } from "../../services/individual-tracker/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { MatchStatsData } from "../stats/types";
import type { TeamColor } from "../team-colors/team-colors";
import type { IndividualTrackerTopBarStatItem } from "./top-bar-stats";

export type IndividualTrackerSectionId = "live-trackers" | "streamer-connections";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export type IndividualTrackerPageMode = "manage" | "view";
export type IndividualTrackerViewSource = "tracker" | "active" | null;

export interface GameSelectionDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly initialSeriesGroups: readonly IndividualTrackerSeriesGroup[];
}

export interface IndividualTrackerViewerAccumulatedStats {
  readonly total: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly customOrLocal: number;
  readonly matchmaking: number;
  readonly groupedSeries: number;
  readonly standalone: number;
}

export interface IndividualTrackerViewerOverviewMatch {
  readonly id: string;
  readonly gameMode: string;
  readonly score: string;
  readonly mapName: string;
  readonly mapThumbnailUrl: string;
  readonly winningTeamIndex?: number | undefined;
}

export interface IndividualTrackerViewerOverviewPlayer {
  readonly id: string;
  readonly content: string;
}

export interface IndividualTrackerViewerOverviewTeam {
  readonly id: string;
  readonly name: string;
  readonly colorHex: string | undefined;
  readonly players: readonly IndividualTrackerViewerOverviewPlayer[];
}

export interface IndividualTrackerViewerMatchCard {
  readonly id: string;
  readonly matchStats: MatchStatsData[] | null;
  readonly backgroundImageUrl: string;
  readonly gameVariantCategory: GameVariantCategory;
  readonly gameMode: string;
  readonly matchNumber: number;
  readonly gameTypeAndMap: string;
  readonly map: string;
  readonly duration: string;
  readonly score: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface IndividualTrackerViewerSeriesTotals {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
  readonly metadata: SeriesMetadata | null;
}

export interface IndividualTrackerViewerTrackedPlayerTotals extends IndividualTrackerViewerSeriesTotals {
  readonly title: string;
}

export interface IndividualTrackerViewerSubstitution {
  readonly id: string;
  readonly playerOutDisplayName: string;
  readonly playerInDisplayName: string;
  readonly teamName: string;
  readonly timestamp: string;
}

export interface IndividualTrackerViewerActiveNeatQueueSeries {
  readonly title: string;
  readonly subtitle: string;
  readonly seriesScore: string;
  readonly teams: readonly {
    readonly name: string;
    readonly players: readonly { id: string; displayName: string }[];
  }[];
  readonly playersAssociationData: Record<string, PlayerAssociationData>;
  readonly substitutions: readonly IndividualTrackerViewerSubstitution[];
}

export type IndividualTrackerViewerTimelineItem =
  | {
      readonly type: "group";
      readonly id: string;
      readonly title: string;
      readonly subtitle: string;
      readonly seriesScore: string;
      readonly overviewMatches: readonly IndividualTrackerViewerOverviewMatch[];
      readonly teams: readonly IndividualTrackerViewerOverviewTeam[];
      readonly seriesTotals: IndividualTrackerViewerSeriesTotals | null;
      readonly matches: readonly IndividualTrackerViewerMatchCard[];
    }
  | {
      readonly type: "match";
      readonly id: string;
      readonly match: IndividualTrackerViewerMatchCard;
    };

export interface IndividualTrackerViewerRenderModel {
  readonly lastUpdatedTime: string;
  readonly trackerStatus: IndividualTrackerState["status"];
  readonly accumulatedStats: IndividualTrackerViewerAccumulatedStats;
  readonly teamColors: readonly TeamColor[];
  readonly activeNeatQueueSeries: IndividualTrackerViewerActiveNeatQueueSeries | null;
  readonly trackedPlayerTotals: IndividualTrackerViewerTrackedPlayerTotals | null;
  readonly gameplayTimeline: readonly IndividualTrackerViewerTimelineItem[];
  readonly trackedEntriesCount: number;
}

// ============================================================================
// Overlay-specific types for PublicViewerSnapshot
// ============================================================================

export interface OverlayTab {
  readonly id: string;
  readonly label: string;
  readonly type: "active-series" | "group" | "standalone";
  readonly teamColor: string | undefined; // hex for winner-relative coloring
  readonly timelineIndex?: number | undefined;
}

export interface OverlayAccumulatedStats {
  readonly wins: number;
  readonly losses: number;
  readonly total: number;
  readonly matchmaking: number;
  readonly custom: number;
}

export interface OverlayTickerRow {
  readonly type: "player" | "team";
  readonly name: string;
  readonly teamId: number;
  readonly stats: readonly {
    name: string;
    value: number;
    display: string;
    bestInTeam: boolean;
    bestInMatch: boolean;
  }[];
  readonly medals: readonly { name: string; count: number; imageUrl: string }[];
}

export interface OverlayTickerGroup {
  readonly matchIndex: number;
  readonly label: string;
  readonly rows: readonly OverlayTickerRow[];
}

export interface IndividualTrackerSnapshot {
  readonly authState: AuthState;
  readonly profileId: string | null;
  readonly xboxXuid: string | null;
  readonly settingsActiveTrackerId: string | null;
  readonly settingsActiveTrackerGamertag: string | null;
  readonly mode: IndividualTrackerPageMode;
  readonly viewSource: IndividualTrackerViewSource;
  readonly viewTrackerId: string | null;
  readonly viewTrackerGamertag: string | null;
  readonly viewConnectionStatus:
    | "idle"
    | "connecting"
    | "connected"
    | "stopped"
    | "error"
    | "disconnected"
    | "not_found";
  readonly viewErrorMessage: string | null;
  readonly viewedMatchHistoryLoading: boolean;
  readonly viewerCanManage: boolean;
  readonly viewerRefreshInProgress: boolean;
  readonly viewerRefreshStartedAt: string | null;
  readonly viewerRefreshPending: boolean;
  readonly viewerRefreshMessage: string | null;
  readonly viewerTrackerSummary: TrackerSearchResult | null;
  readonly viewerRenderModel: IndividualTrackerViewerRenderModel | null;
  readonly viewerTopBarStats: readonly IndividualTrackerTopBarStatItem[];
  readonly activeSection: IndividualTrackerSectionId;
  readonly viewerTeamColor: string;
  readonly viewerEnemyColor: string;
  readonly viewerDefaultColorMode: StreamerViewColorMode;
  readonly viewerShowTabs: boolean;
  readonly viewerShowTicker: boolean;
  readonly viewerShowTeamDetails: boolean;
  readonly viewerObserverTeamColor: string;
  readonly viewerObserverEnemyColor: string;
  readonly viewerObserverOverrideTeamColor: string | null;
  readonly viewerObserverOverrideEnemyColor: string | null;
  readonly viewerDisplaySettings: DisplaySettings;
  readonly viewerTickerSettings: TickerSettings;
  readonly viewerFontSizeSettings: FontSizeSettings;
  readonly viewerSettingsSaving: boolean;
  readonly viewerSettingsErrorMessage: string | null;
  readonly loading: boolean;
  readonly errorMessage: string | null;
}
