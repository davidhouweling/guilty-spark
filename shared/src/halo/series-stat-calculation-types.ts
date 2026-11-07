import type { MatchStats, Stats } from "halo-infinite-api";
import type { PlayerObjectiveSummary } from "./objective-summary";
import type { StatsCollection } from "./types";

export interface CalculatedSeriesRosterPlayer {
  player: MatchStats["Players"][0];
  coreStats: Stats["CoreStats"];
}

export interface CalculatedSeriesPlayer extends CalculatedSeriesRosterPlayer {
  values: StatsCollection;
  gamesPlayed: number;
  objectiveSummary: PlayerObjectiveSummary | null;
}

export interface CalculatedSeriesTeamTotals {
  teamId: number;
  coreStats: Stats["CoreStats"];
  values: StatsCollection;
  players: CalculatedSeriesRosterPlayer[];
}

export interface CalculatedSeriesPlayerTeam {
  teamId: number;
  bestPlayerValues: Map<string, number>;
  players: CalculatedSeriesPlayer[];
}

export interface CalculatedSeriesTeamStats {
  bestValues: Map<string, number>;
  teams: CalculatedSeriesTeamTotals[];
}

export interface CalculatedSeriesPlayerStats {
  bestValues: Map<string, number>;
  teams: CalculatedSeriesPlayerTeam[];
}
