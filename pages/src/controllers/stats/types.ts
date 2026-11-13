import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { TeamColor } from "../../components/team-colors/team-colors";
import type { ScoreProgressionViewData } from "../../components/stats/score-progression/types";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "./kill-matrix/types";

export interface MatchDetailAnalyticsInput {
  readonly killMatrix: MatchAnalytics["killMatrix"] | null;
  readonly scoreProgression: MatchAnalytics["scoreProgression"];
  readonly teamColors: readonly TeamColor[];
  readonly teamSize: number | null;
}

export interface MatchDetailAnalyticsData {
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly transposedKillMatrixPivotData: KillMatrixPivotData;
  readonly crossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamKillMatrixData: KillMatrixCrossTeamData | null;
  readonly scoreProgressionViewData: ScoreProgressionViewData | null;
}

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export interface MatchStatsData {
  teamId: number;
  teamStats: MatchStatsValues[];
  players: MatchStatsPlayerData[];
  teamMedals: MedalEntry[];
}

export interface SeriesStatsData {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
}

export interface MatchStatsPlayerData {
  name: string;
  values: MatchStatsValues[];
  medals: MedalEntry[];
}

export interface MatchStatsValues {
  key?: string | undefined;
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
  icon?: React.ReactNode;
}
