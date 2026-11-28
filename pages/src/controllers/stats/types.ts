import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesAggregation } from "@guilty-spark/shared/contracts/stats/detail";
import type { TeamColor } from "../../components/team-colors/team-colors";
import type { ScoreProgressionViewData } from "../../components/stats/score-progression/types";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "./kill-matrix/types";

export interface MatchDetailAnalyticsInput {
  readonly killMatrix: MatchAnalytics["killMatrix"] | null;
  readonly scoreProgression: MatchAnalytics["scoreProgression"];
  readonly teamColors: readonly TeamColor[];
  readonly teamSize: number | null;
  readonly teamNameByTeamId?: ReadonlyMap<number, string> | undefined;
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

export interface PlayerMedalProjection {
  readonly playerId: string;
  readonly medals: MedalEntry[];
  readonly hasUnknownRarity: boolean;
}

export interface TeamMedalProjection {
  readonly teamId: number;
  readonly players: readonly PlayerMedalProjection[];
  readonly teamMedals: MedalEntry[];
  readonly hasUnknownRarity: boolean;
}

export interface MatchMedalProjection {
  readonly teams: readonly TeamMedalProjection[];
  readonly hasUnknownRarity: boolean;
}

export interface SeriesStatsData {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
}

export interface MatchStatsPlayerData {
  playerId?: string | undefined;
  name: string;
  values: MatchStatsValues[];
  medals: MedalEntry[];
}

export interface IdentifiedMatchStatsPlayerData extends MatchStatsPlayerData {
  playerId: string;
}

export interface IdentifiedMatchStatsData extends Omit<MatchStatsData, "players"> {
  players: IdentifiedMatchStatsPlayerData[];
}

export interface IdentifiedSeriesStatsData {
  readonly teamData: IdentifiedMatchStatsData[];
  readonly playerData: IdentifiedMatchStatsData[];
}

export interface SeriesTickerPlayer extends IdentifiedMatchStatsPlayerData {
  readonly gamertag: string | null;
  readonly hasUnknownRarity: boolean;
}

export interface SeriesTickerTeam extends Omit<IdentifiedMatchStatsData, "players"> {
  readonly players: SeriesTickerPlayer[];
  readonly hasUnknownRarity: boolean;
}

export type SeriesTickerProjection =
  | {
      readonly status: "resolved";
      readonly teamData: SeriesTickerTeam[];
      readonly playerData: SeriesTickerTeam[];
      readonly hasUnknownRarity: boolean;
    }
  | Extract<SeriesAggregation, { status: "unavailable" }>;

export interface MatchStatsValues {
  key?: string | undefined;
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
  icon?: React.ReactNode;
}
