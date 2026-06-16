import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";

export interface MatchStatsData {
  teamId: number;
  teamStats: MatchStatsValues[];
  players: MatchStatsPlayerData[];
  teamMedals: MedalEntry[];
}

export interface MatchStatsPlayerData {
  name: string;
  values: MatchStatsValues[];
  medals: MedalEntry[];
}

export interface MatchStatsValues {
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
  icon?: React.ReactNode;
}
