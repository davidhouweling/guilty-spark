import type { SeriesAggregation, SeriesPlayer, SeriesTeam } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesStatsData } from "../../controllers/stats/stats-controller";
import type { MatchStatsPlayerData } from "../../controllers/stats/types";
import { DetailStatsFormatter } from "./match-detail-stats-presenter";

type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;
interface TeamPlayer {
  player: SeriesPlayer;
  entry: SeriesPlayer["teamStats"][number];
}

export class SeriesDetailStatsPresenter {
  private readonly formatter: DetailStatsFormatter;

  constructor(locale?: string) {
    this.formatter = new DetailStatsFormatter(locale);
  }

  present(aggregation: ResolvedAggregation): SeriesStatsData {
    const playersById = new Map(aggregation.players.map((player) => [player.playerId, player]));
    const playersByTeamId = new Map(
      aggregation.teams.map((team) => [team.seriesTeamId, this.getTeamPlayers(team, playersById)]),
    );
    const bestTeams = this.formatter.getBestValues(aggregation.teams.flatMap((team) => team.stats));
    const bestPlayers = this.formatter.getBestValues(
      [...playersByTeamId.values()].flatMap((players) => players.flatMap(({ entry }) => entry.stats)),
    );
    const teamData: SeriesStatsData["teamData"] = [];
    const playerData: SeriesStatsData["playerData"] = [];

    for (const team of aggregation.teams) {
      const players = playersByTeamId.get(team.seriesTeamId) ?? [];
      const bestInTeam = this.formatter.getBestValues(players.flatMap(({ entry }) => entry.stats));
      const playerRows = players.map(({ player, entry }): MatchStatsPlayerData => ({
        name: `${player.playerType === 1 ? (player.gamertag ?? "*Unknown*") : "Bot"}${this.getGamesSuffix(entry.gamesPlayed, aggregation.gamesPlayed)}`,
        values: entry.stats.map((stat) => this.formatter.presentStat(stat, bestInTeam, bestPlayers)),
        medals: this.formatter.presentMedals(entry.medals),
      }));
      const teamMedals = this.formatter.presentMedals(team.medals);
      teamData.push({
        teamId: team.seriesTeamId,
        teamStats: team.stats.map((stat) => this.formatter.presentStat(stat, new Map(), bestTeams)),
        teamMedals,
        players: playerRows.map((player) => ({ ...player, values: [] })),
      });
      playerData.push({
        teamId: team.seriesTeamId,
        teamStats: [],
        teamMedals,
        players: playerRows,
      });
    }

    return { teamData, playerData };
  }

  private getTeamPlayers(team: SeriesTeam, playersById: Map<string, SeriesPlayer>): TeamPlayer[] {
    return team.playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId);
      const entry = player?.teamStats.find((stats) => stats.seriesTeamId === team.seriesTeamId);
      return player && entry ? [{ player, entry }] : [];
    });
  }

  private getGamesSuffix(gamesPlayed: number, totalGames: number): string {
    return gamesPlayed < totalGames ? ` (${gamesPlayed.toString()}/${totalGames.toString()} games)` : "";
  }
}
