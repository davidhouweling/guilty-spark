import type { GameVariantCategory, MatchStats } from "halo-infinite-api";

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";

export interface MatchStatsData {
  teamId: number;
  teamStats: MatchStatsValues[];
  players: MatchStatsPlayerData[];
  teamMedals: MatchStatsMedal[];
}

export interface MatchStatsPlayerData {
  name: string;
  values: MatchStatsValues[];
  medals: MatchStatsMedal[];
}

export interface MatchStatsValues {
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
  icon?: React.ReactNode;
}

export interface MatchStatsMedal {
  name: string;
  count: number;
  sortingWeight: number;
}
