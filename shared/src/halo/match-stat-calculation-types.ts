import type { MatchStats, Stats } from "halo-infinite-api";
import type { StatsCollection } from "./types";

export interface CalculatedMatchPlayerStats {
  player: MatchStats["Players"][0];
  values: StatsCollection;
  coreStats: Stats["CoreStats"];
  medalStats: Stats["CoreStats"];
}

export interface CalculatedMatchTeamStats {
  teamId: number;
  values: StatsCollection;
  coreStats: Stats["CoreStats"];
  bestPlayerValues: Map<string, number>;
  players: CalculatedMatchPlayerStats[];
}

export interface CalculatedMatchStats {
  bestTeamValues: Map<string, number>;
  bestPlayerValues: Map<string, number>;
  teams: CalculatedMatchTeamStats[];
}
