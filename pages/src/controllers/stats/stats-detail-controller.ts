import type { MatchDetail, SeriesAggregation } from "@guilty-spark/shared/contracts/stats/detail";
import { formatScoreProgression } from "../../components/stats/score-progression/score-progression-formatter";
import { getTeamColorOrDefault } from "../../components/team-colors/team-colors";
import type { TeamColor } from "../../components/team-colors/team-colors";
import { KillMatrixFormatter } from "./kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "./kill-matrix/types";
import type { KillMatrixPlayer } from "./kill-matrix/types";
import type {
  MatchDetailAnalyticsData,
  MatchDetailAnalyticsInput,
  MatchStatsData,
  MatchStatsPlayerData,
  SeriesStatsData,
} from "./types";
import { DetailStatsFormatter } from "./detail-stats-formatter";

type DetailPlayer = MatchDetail["players"][number];
type DetailTeam = MatchDetail["teams"][number];
type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;
type SeriesPlayer = ResolvedAggregation["players"][number];
type SeriesTeam = ResolvedAggregation["teams"][number];

interface TeamPlayer {
  player: SeriesPlayer;
  entry: SeriesPlayer["teamStats"][number];
}

export class StatsDetailController {
  private readonly formatter: DetailStatsFormatter;
  private readonly killMatrixFormatter = new KillMatrixFormatter();

  constructor(locale?: string) {
    this.formatter = new DetailStatsFormatter(locale);
  }

  mapMatchDetailToStats(detail: MatchDetail): MatchStatsData[] {
    const playersById = new Map(detail.players.map((player) => [player.playerId, player]));
    const teamPlayers = detail.teams.map((team) => this.getMatchTeamPlayers(team, playersById));
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

  mapMatchDetailToAnalytics(
    detail: MatchDetail,
    { killMatrix, scoreProgression, teamColors, teamSize }: MatchDetailAnalyticsInput,
  ): MatchDetailAnalyticsData {
    const players = this.getMatchKillMatrixPlayers(detail);
    const playersByXuid = new Map(players.map((player) => [player.xuid, player]));
    const rows =
      killMatrix == null
        ? null
        : this.killMatrixFormatter.present({
            analytics: { requestedModules: ["killMatrix"], killMatrix, scoreProgression: null },
            playersByXuid,
          });
    const crossTeam = rows == null ? null : KillMatrixFormatter.buildCrossTeam(rows, players);

    return {
      killMatrixPivotData: rows == null ? EMPTY_KILL_MATRIX_PIVOT_DATA : KillMatrixFormatter.pivot(rows, players),
      transposedKillMatrixPivotData:
        rows == null ? EMPTY_KILL_MATRIX_PIVOT_DATA : KillMatrixFormatter.transpose(rows, players),
      crossTeamKillMatrixData: crossTeam?.crossTeamData ?? null,
      swappedCrossTeamKillMatrixData: crossTeam?.swappedCrossTeamData ?? null,
      scoreProgressionViewData:
        scoreProgression == null
          ? null
          : formatScoreProgression(scoreProgression, this.getScoreProgressionTeamColors(detail, teamColors), teamSize),
    };
  }

  mapSeriesAggregationToStats(aggregation: ResolvedAggregation): SeriesStatsData {
    const playersById = new Map(aggregation.players.map((player) => [player.playerId, player]));
    const playersByTeamId = new Map(
      aggregation.teams.map((team) => [team.seriesTeamId, this.getSeriesTeamPlayers(team, playersById)]),
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

  private getMatchTeamPlayers(
    team: DetailTeam,
    playersById: Map<string, DetailPlayer>,
  ): { player: DetailPlayer; entry: DetailPlayer["teamStats"][number] }[] {
    return team.playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId);
      const entry = player?.teamStats.find((stats) => stats.matchTeamId === team.matchTeamId);
      return player && entry ? [{ player, entry }] : [];
    });
  }

  private getMatchKillMatrixPlayers(detail: MatchDetail): KillMatrixPlayer[] {
    return detail.players.flatMap((player) =>
      player.xuid == null
        ? []
        : [
            {
              xuid: player.xuid,
              gamertag: player.gamertag ?? "*Unknown*",
              teamId: player.lastMatchTeamId,
            },
          ],
    );
  }

  private getScoreProgressionTeamColors(detail: MatchDetail, teamColors: readonly TeamColor[]): TeamColor[] {
    return [...detail.teams]
      .sort((left, right) => left.matchTeamId - right.matchTeamId)
      .map((team, index) => teamColors[team.matchTeamId] ?? getTeamColorOrDefault(undefined, index));
  }

  private getSeriesTeamPlayers(team: SeriesTeam, playersById: Map<string, SeriesPlayer>): TeamPlayer[] {
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
