import type {
  LiveTrackerMatchSummary,
  LiveTrackerStatus,
  PlayerAssociationData,
} from "@guilty-spark/shared/live-tracker/types";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchStatsData } from "../../controllers/stats/types";
import type { SeriesMetadata } from "../../controllers/stats/series-metadata";
import type { ComponentLoaderStatus } from "../component-loader/component-loader";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "../../controllers/stats/kill-matrix/types";
import type { SeriesMatchAnalyticsById, SeriesStatsViewModel } from "../series-stats/types";
import type { LiveTrackerParams } from "./live-tracker-store";

export interface LiveTrackerPlayerRenderModel {
  readonly id: string;
  readonly displayName: string;
}

export interface LiveTrackerTeamRenderModel {
  readonly name: string;
  readonly players: readonly LiveTrackerPlayerRenderModel[];
}

export interface LiveTrackerMatchRenderModel {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly gameType: string;
  readonly gameMap: string;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly gameInfo?: LiveTrackerMatchSummary["gameInfo"];
}

export interface LiveTrackerSubstitutionRenderModel {
  readonly playerOutId: string;
  readonly playerOutDisplayName: string;
  readonly playerInId: string;
  readonly playerInDisplayName: string;
  readonly teamName: string;
  readonly timestamp: string;
}

export interface LiveTrackerMatchSubstitutions {
  readonly byMatchId: ReadonlyMap<string, readonly LiveTrackerSubstitutionRenderModel[]>;
  readonly trailing: readonly LiveTrackerSubstitutionRenderModel[];
}

export interface LiveTrackerPlannedGameRenderModel {
  readonly gameNumber: number;
  readonly mode: string;
  readonly map: string;
  readonly gameMapThumbnailUrl: string;
  readonly gameModeIconUrl: string | null;
}

export interface LiveTrackerSeriesDataRenderModel {
  readonly seriesId: {
    readonly guildId: string;
    readonly queueNumber: number;
  };
  readonly teams: readonly {
    readonly name: string;
    readonly playerIds: readonly string[];
  }[];
  readonly seriesScore: string;
  readonly matchIds: readonly string[];
  readonly startTime: string;
  readonly lastUpdateTime: string;
}

export type LiveTrackerStateRenderModel = LiveTrackerNeatQueueStateRenderModel;

/**
 * Render model for NeatQueue tracker (Discord guild queue).
 */
export interface LiveTrackerNeatQueueStateRenderModel {
  readonly type: "neatqueue";
  readonly guildName: string;
  readonly guildId: string;
  readonly guildIcon: string | null;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly seriesStartedAt?: string | undefined;
  readonly lastUpdateTime: string;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
  readonly plannedGames: readonly LiveTrackerPlannedGameRenderModel[];
  readonly substitutions: readonly LiveTrackerSubstitutionRenderModel[];
  readonly seriesScore: string;
  readonly medalMetadata: MedalMetadata;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly seriesData?: LiveTrackerSeriesDataRenderModel;
}

export interface LiveTrackerAvailablePlayer {
  readonly id: string;
  readonly name: string;
}

export interface MatchKillMatrix {
  readonly matchId: string;
  readonly pivotData: KillMatrixPivotData;
  readonly transposedPivotData: KillMatrixPivotData;
  readonly crossTeamData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamData: KillMatrixCrossTeamData | null;
}

export interface KillMatrixResult {
  readonly pivotData: KillMatrixPivotData;
  readonly transposedPivotData: KillMatrixPivotData;
  readonly crossTeamData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamData: KillMatrixCrossTeamData | null;
}

export interface LiveTrackerViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly iconUrl: string | null;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly state: LiveTrackerStateRenderModel | null;
  readonly sortedSubstitutions: readonly LiveTrackerSubstitutionRenderModel[];
  readonly matchSubstitutions: LiveTrackerMatchSubstitutions;
  readonly availablePlayers: readonly LiveTrackerAvailablePlayer[];
  readonly params: LiveTrackerParams;
  readonly seriesDetail: SeriesDetailResponse | null;
  readonly seriesDetailStatus: ComponentLoaderStatus;
  readonly seriesDetailError: string | null;
  readonly seriesAnalyticsByMatchId: SeriesMatchAnalyticsById;
  readonly detailViewModel: SeriesStatsViewModel | null;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly analyticsStatus: ComponentLoaderStatus;
  readonly allMatchKillMatrix: readonly MatchKillMatrix[];
  readonly seriesKillMatrix: KillMatrixResult | null;
  readonly livePreSeriesPlayersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly livePreSeriesStatus: ComponentLoaderStatus;
  readonly livePreSeriesError: string | null;
}
