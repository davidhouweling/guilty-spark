import type {
  IndividualTrackerSeriesGroup,
  IndividualTrackerState,
} from "@guilty-spark/shared/individual-tracker/types";
import type { TrackerSearchResult } from "../../services/individual-tracker/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { MatchStatsData } from "../stats/types";
import type { TeamColor } from "../team-colors/team-colors";

export type IndividualTrackerSectionId = "live-trackers" | "streamer-connections" | "additional-options";

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
  readonly gameMode: string;
  readonly matchNumber: number;
  readonly gameTypeAndMap: string;
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
  readonly trackedPlayerTotals: IndividualTrackerViewerTrackedPlayerTotals | null;
  readonly gameplayTimeline: readonly IndividualTrackerViewerTimelineItem[];
  readonly trackedEntriesCount: number;
}

export interface IndividualTrackerSnapshot {
  readonly authState: AuthState;
  readonly profileId: string | null;
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
  readonly activeSection: IndividualTrackerSectionId;
  readonly viewerTeamColor: string;
  readonly viewerEnemyColor: string;
  readonly viewerSettingsSaving: boolean;
  readonly viewerSettingsErrorMessage: string | null;
  readonly loading: boolean;
  readonly errorMessage: string | null;
}
