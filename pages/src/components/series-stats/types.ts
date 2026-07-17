import type { ComponentLoaderStatus } from "../component-loader/component-loader";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "../../controllers/stats/kill-matrix/types";
import type { MatchStatsData } from "../../controllers/stats/types";
import type { TeamColor } from "../team-colors/team-colors";
import type { ScoreProgressionViewData } from "../stats/score-progression/types";

export interface SeriesMatchSummary {
  readonly matchId: string;
  readonly gameMapThumbnailUrl: string;
  readonly gameModeIconUrl: string;
  readonly gameModeAlt: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly gameMap: string;
  readonly winningTeamColorHex: string | null;
}

export interface SeriesTeamCard {
  readonly name: string;
  readonly players: readonly string[];
  readonly teamColorHex: string;
}

export interface SeriesMatchDetail {
  readonly matchId: string;
  readonly data: MatchStatsData[] | null;
  readonly gameMapThumbnailUrl: string;
  readonly gameModeIconUrl: string;
  readonly gameModeAlt: string;
  readonly matchNumber: number;
  readonly gameTypeAndMap: string;
  readonly duration: string;
  readonly score: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly teamColors: readonly TeamColor[];
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly transposedKillMatrixPivotData: KillMatrixPivotData;
  readonly crossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly killMatrixStatus: ComponentLoaderStatus;
  readonly scoreProgressionViewData: ScoreProgressionViewData | null;
}

export interface SeriesStatsSummary {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
  readonly metadata: {
    readonly score: string;
    readonly duration: string;
    readonly startTime: string;
    readonly endTime: string;
  } | null;
  readonly teamColors: readonly TeamColor[];
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly transposedKillMatrixPivotData: KillMatrixPivotData;
  readonly crossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly killMatrixStatus: ComponentLoaderStatus;
}

export interface SeriesStatsViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly seriesScore: string;
  readonly matchSummaries: readonly SeriesMatchSummary[];
  readonly teams: readonly SeriesTeamCard[];
  readonly seriesStats: SeriesStatsSummary | null;
  readonly matchDetails: readonly SeriesMatchDetail[];
}
