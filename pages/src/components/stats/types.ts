import type { GameVariantCategory, MatchStats } from "halo-infinite-api";

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export enum StatsValueSortBy {
  ASC,
  DESC,
}

export interface StatsValue {
  value: number;
  sortBy: StatsValueSortBy;
  display?: string;
}

export type StatsCollection = Map<string, StatsValue>;

export interface MatchStatsData {
  teamId: number;
  teamStats: MatchStatsValues[];
  players: MatchStatsPlayerData[];
}

export interface MatchStatsPlayerData {
  name: string;
  rank: number;
  personalScore: number;
  values: MatchStatsValues[];
}

export interface MatchStatsValues {
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
}
