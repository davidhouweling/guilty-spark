import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { createMatchStatsFormatter } from "./create";
import { SeriesTeamStatsFormatter } from "./series-team-stats-formatter";
import { SeriesPlayerStatsFormatter } from "./series-player-stats-formatter";
import { KillMatrixFormatter } from "./kill-matrix/kill-matrix-formatter";
import type { MatchStatsData } from "./types";
import type { KillMatrixViewRow } from "./kill-matrix/types";

export interface StatsPlayer {
  readonly xuid: string;
  readonly gamertag: string;
  readonly teamId: number | null;
}

export interface SeriesStatsData {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
}

export class StatsController {
  private matchStats: MatchStatsData[] | null = null;
  private seriesStats: SeriesStatsData | null = null;
  private killMatrixRows: KillMatrixViewRow[] | null = null;
  private players: StatsPlayer[] | null = null;

  loadMatch(match: MatchStats, playerMap: Map<string, string>, medals: MedalMetadata): void {
    const formatter = createMatchStatsFormatter(match.MatchInfo.GameVariantCategory);
    this.matchStats = formatter.getData(match, playerMap, medals);
    this.players = this.buildPlayers(this.matchStats, playerMap);
  }

  loadSeries(matches: MatchStats[], playerMap: Map<string, string>, medals: MedalMetadata): void {
    const teamFormatter = new SeriesTeamStatsFormatter();
    const playerFormatter = new SeriesPlayerStatsFormatter();
    this.seriesStats = {
      teamData: teamFormatter.getSeriesData(matches, playerMap, medals),
      playerData: playerFormatter.getSeriesData(matches, playerMap, medals),
    };
    this.players = this.buildPlayers(this.seriesStats.playerData, playerMap);
  }

  loadAnalytics(analytics: MatchAnalytics, playerMap: Map<string, string>): void {
    const playersByXuid = this.buildPlayersByXuid(playerMap);
    const formatter = new KillMatrixFormatter();
    this.killMatrixRows = formatter.present({ analytics, playersByXuid });
  }

  getPlayers(): StatsPlayer[] {
    return Preconditions.checkExists(this.players, "Players not loaded — call loadMatch() or loadSeries() first");
  }

  getMatchStats(): MatchStatsData[] {
    return Preconditions.checkExists(this.matchStats, "Match stats not loaded — call loadMatch() first");
  }

  getSeriesStats(): SeriesStatsData {
    return Preconditions.checkExists(this.seriesStats, "Series stats not loaded — call loadSeries() first");
  }

  getKillMatrix(): KillMatrixViewRow[] {
    return Preconditions.checkExists(this.killMatrixRows, "Kill matrix not loaded — call loadAnalytics() first");
  }

  private buildPlayers(data: MatchStatsData[], playerMap: Map<string, string>): StatsPlayer[] {
    const gamertagToXuid = new Map([...playerMap.entries()].map(([xuid, gamertag]) => [gamertag, xuid]));
    return data.flatMap((team) =>
      team.players.map((player) => ({
        xuid: gamertagToXuid.get(player.name) ?? player.name,
        gamertag: player.name,
        teamId: team.teamId,
      })),
    );
  }

  private buildPlayersByXuid(playerMap: Map<string, string>): Map<string, { gamertag: string; teamId: number | null }> {
    if (this.players != null) {
      return new Map(this.players.map((p) => [p.xuid, { gamertag: p.gamertag, teamId: p.teamId }]));
    }
    return new Map([...playerMap.entries()].map(([xuid, gamertag]) => [xuid, { gamertag, teamId: null }]));
  }
}
