import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchStatsData, MatchStatsPlayerData } from "../../controllers/stats/types";
import { DetailStatsFormatter } from "./detail-stats-formatter";

type DetailPlayer = MatchDetail["players"][number];
type DetailTeam = MatchDetail["teams"][number];

export class MatchDetailStatsPresenter {
  private readonly formatter: DetailStatsFormatter;

  constructor(locale?: string) {
    this.formatter = new DetailStatsFormatter(locale);
  }

  present(detail: MatchDetail): MatchStatsData[] {
    const playersById = new Map(detail.players.map((player) => [player.playerId, player]));
    const teamPlayers = detail.teams.map((team) => this.getTeamPlayers(team, playersById));
    const bestTeams = this.formatter.getBestValues(detail.teams.flatMap((team) => team.stats));
    const bestPlayers = this.formatter.getBestValues(
      teamPlayers.flatMap((players) => players.flatMap(({ entry }) => entry.stats)),
    );

    return detail.teams.map((team, index) => {
      const players = teamPlayers[index] ?? [];
      const bestInTeam = this.formatter.getBestValues(players.flatMap(({ entry }) => entry.stats));
      return {
        teamId: team.matchTeamId,
        teamStats: team.stats.map((stat) => this.formatter.presentStat(stat, new Map(), bestTeams)),
        teamMedals: this.formatter.presentMedals(team.medals),
        players: players.map(({ player, entry }): MatchStatsPlayerData => ({
          name: player.playerType === 1 ? (player.gamertag ?? "*Unknown*") : "Bot",
          values: entry.stats.map((stat) => this.formatter.presentStat(stat, bestInTeam, bestPlayers)),
          medals: this.formatter.presentMedals(entry.medals),
        })),
      };
    });
  }

  private getTeamPlayers(
    team: DetailTeam,
    playersById: Map<string, DetailPlayer>,
  ): { player: DetailPlayer; entry: DetailPlayer["teamStats"][number] }[] {
    return team.playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId);
      const entry = player?.teamStats.find((stats) => stats.matchTeamId === team.matchTeamId);
      return player && entry ? [{ player, entry }] : [];
    });
  }
}
