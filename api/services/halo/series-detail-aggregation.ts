import type { MatchStats } from "halo-infinite-api";
import { seriesAggregationSchema } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesAggregation, SeriesPlayer, SeriesTeam } from "@guilty-spark/shared/contracts/stats/detail";
import {
  collapseSequentialSeriesEntries,
  getMatchOutcomeLabel,
  summarizeSeriesOutcome,
} from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import {
  calculateSeriesPlayerStats,
  calculateSeriesTeamStats,
} from "@guilty-spark/shared/halo/series-stat-calculation";
import { serializeMedalDetails } from "@guilty-spark/shared/halo/medal-detail-serialization";
import { serializeStatDetails } from "@guilty-spark/shared/halo/stat-detail-serialization";
import type { SeriesDetailAggregationOptions } from "./types";

type CalculatedSeriesPlayer = ReturnType<typeof calculateSeriesPlayerStats>["teams"][number]["players"][number];

interface PlayerParticipation {
  player: MatchStats["Players"][number];
  gamesPlayed: number;
  teamGamesPlayed: Map<number, number>;
}

function getCollapsedMatches(matches: readonly MatchStats[]): MatchStats[] {
  const entries = matches.map((match) => ({
    match,
    startTime: match.MatchInfo.StartTime,
    mapAssetId: match.MatchInfo.MapVariant.AssetId,
    mapVersionId: match.MatchInfo.MapVariant.VersionId,
    gameVariantCategory: match.MatchInfo.GameVariantCategory,
  }));
  return collapseSequentialSeriesEntries(entries).map(({ match }) => match);
}

function getPlayerTeamIds(match: MatchStats, player: MatchStats["Players"][number]): Set<number> {
  const availableTeamIds = new Set(match.Teams.map((team) => team.TeamId));
  const teamIds = new Set<number>();
  if (availableTeamIds.has(player.LastTeamId)) {
    teamIds.add(player.LastTeamId);
  }
  for (const stats of player.PlayerTeamStats) {
    if (availableTeamIds.has(stats.TeamId)) {
      teamIds.add(stats.TeamId);
    }
  }
  return teamIds;
}

function collectPlayerParticipation(matches: readonly MatchStats[]): Map<string, PlayerParticipation> {
  const participationByPlayerId = new Map<string, PlayerParticipation>();
  for (const match of matches) {
    const playersInMatch = new Set<string>();
    for (const player of match.Players) {
      if (playersInMatch.has(player.PlayerId)) {
        continue;
      }
      playersInMatch.add(player.PlayerId);
      const participation = participationByPlayerId.get(player.PlayerId);
      const teamIds = getPlayerTeamIds(match, player);
      if (participation == null) {
        participationByPlayerId.set(player.PlayerId, {
          player,
          gamesPlayed: 1,
          teamGamesPlayed: new Map(Array.from(teamIds, (teamId) => [teamId, 1])),
        });
        continue;
      }

      participation.gamesPlayed += 1;
      for (const teamId of teamIds) {
        participation.teamGamesPlayed.set(teamId, (participation.teamGamesPlayed.get(teamId) ?? 0) + 1);
      }
    }
  }
  return participationByPlayerId;
}

function collectCalculatedPlayersByTeam(
  calculated: ReturnType<typeof calculateSeriesPlayerStats>,
): Map<number, Map<string, CalculatedSeriesPlayer>> {
  const playersByTeam = new Map<number, Map<string, CalculatedSeriesPlayer>>();
  for (const team of calculated.teams) {
    const players = new Map<string, CalculatedSeriesPlayer>();
    for (const player of team.players) {
      players.set(player.player.PlayerId, player);
    }
    playersByTeam.set(team.teamId, players);
  }
  return playersByTeam;
}

function collectOverallCalculatedPlayers(
  calculated: ReturnType<typeof calculateSeriesPlayerStats>,
): Map<string, CalculatedSeriesPlayer> {
  const playersById = new Map<string, CalculatedSeriesPlayer>();
  for (const players of calculated.teams) {
    for (const player of players.players) {
      if (!playersById.has(player.player.PlayerId)) {
        playersById.set(player.player.PlayerId, player);
      }
    }
  }
  return playersById;
}

function mapPlayerTeamTotals(
  playerId: string,
  teamIds: readonly number[],
  participation: PlayerParticipation,
  playersByTeam: ReadonlyMap<number, ReadonlyMap<string, CalculatedSeriesPlayer>>,
  options: SeriesDetailAggregationOptions,
): SeriesPlayer["teamStats"] {
  const metadata = options.medalMetadataById ?? {};
  const difficulties = options.medalDifficulties ?? [];
  const totals: SeriesPlayer["teamStats"] = [];
  for (const teamId of teamIds) {
    const gamesPlayed = participation.teamGamesPlayed.get(teamId);
    if (gamesPlayed == null) {
      continue;
    }
    const calculated = playersByTeam.get(teamId)?.get(playerId);
    totals.push({
      seriesTeamId: teamId,
      gamesPlayed,
      stats: calculated == null ? [] : serializeStatDetails(calculated.values, calculated.coreStats),
      medals: calculated == null ? [] : serializeMedalDetails(calculated.coreStats.Medals, metadata, difficulties),
    });
  }
  return totals;
}

function mapSeriesPlayers(
  teamIds: readonly number[],
  participationByPlayerId: ReadonlyMap<string, PlayerParticipation>,
  calculatedByPlayerId: ReadonlyMap<string, CalculatedSeriesPlayer>,
  playersByTeam: ReadonlyMap<number, ReadonlyMap<string, CalculatedSeriesPlayer>>,
  options: SeriesDetailAggregationOptions,
): SeriesPlayer[] {
  const metadata = options.medalMetadataById ?? {};
  const difficulties = options.medalDifficulties ?? [];
  const players: SeriesPlayer[] = [];
  for (const [playerId, participation] of participationByPlayerId) {
    const { player } = participation;
    const calculated = calculatedByPlayerId.get(playerId);
    const identity = options.identitiesByPlayerId?.get(playerId);
    const xuid = getPlayerXuid(player);
    const discordUserId = identity?.discordUserId;
    players.push({
      playerId,
      ...(/^\d+$/.test(xuid) ? { xuid } : {}),
      ...(discordUserId == null ? {} : { discordUserId }),
      gamertag: identity?.gamertag ?? null,
      playerType: player.PlayerType,
      gamesPlayed: participation.gamesPlayed,
      stats: calculated == null ? [] : serializeStatDetails(calculated.values, calculated.coreStats),
      medals: calculated == null ? [] : serializeMedalDetails(calculated.coreStats.Medals, metadata, difficulties),
      teamStats: mapPlayerTeamTotals(playerId, teamIds, participation, playersByTeam, options),
    });
  }
  return players;
}

function getTeamPlayerIds(teamId: number, participationByPlayerId: ReadonlyMap<string, PlayerParticipation>): string[] {
  const playerIds: string[] = [];
  for (const [playerId, participation] of participationByPlayerId) {
    if (participation.teamGamesPlayed.has(teamId)) {
      playerIds.push(playerId);
    }
  }
  return playerIds;
}

function getTeamSeriesOutcome(
  teamId: number,
  collapsedMatches: readonly MatchStats[],
): Pick<SeriesTeam, "outcome" | "gamesWon"> {
  const outcomes: ReturnType<typeof getMatchOutcomeLabel>[] = [];
  let gamesWon = 0;
  for (const match of collapsedMatches) {
    const team = match.Teams.find((candidate) => candidate.TeamId === teamId);
    if (team == null) {
      continue;
    }
    const outcome = getMatchOutcomeLabel(team.Outcome);
    outcomes.push(outcome);
    if (outcome === "Win") {
      gamesWon += 1;
    }
  }
  return { outcome: summarizeSeriesOutcome(outcomes), gamesWon };
}

function mapSeriesTeams(
  teamStats: ReturnType<typeof calculateSeriesTeamStats>,
  matches: readonly MatchStats[],
  collapsedMatches: readonly MatchStats[],
  participationByPlayerId: ReadonlyMap<string, PlayerParticipation>,
  options: SeriesDetailAggregationOptions,
): SeriesTeam[] {
  const metadata = options.medalMetadataById ?? {};
  const difficulties = options.medalDifficulties ?? [];
  return teamStats.teams.map((team) => {
    const teamGamesPlayed = matches.filter((match) => match.Teams.some(({ TeamId }) => TeamId === team.teamId)).length;
    const outcome = getTeamSeriesOutcome(team.teamId, collapsedMatches);
    return {
      seriesTeamId: team.teamId,
      name: options.teamNamesBySeriesTeamId?.get(team.teamId) ?? null,
      outcome: outcome.outcome,
      gamesPlayed: teamGamesPlayed,
      gamesWon: outcome.gamesWon,
      playerIds: getTeamPlayerIds(team.teamId, participationByPlayerId),
      stats: serializeStatDetails(team.values, team.coreStats),
      medals: serializeMedalDetails(team.coreStats.Medals, metadata, difficulties),
    };
  });
}

export function mapSeriesDetailAggregation(
  stableMatches: readonly MatchStats[],
  options: SeriesDetailAggregationOptions = {},
): SeriesAggregation {
  const matches = [...stableMatches];
  const calculatedTeams = calculateSeriesTeamStats(matches);
  const calculatedPlayers = calculateSeriesPlayerStats(matches);
  const participationByPlayerId = collectPlayerParticipation(matches);
  const collapsedMatches = getCollapsedMatches(matches);
  const teamIds = calculatedTeams.teams.map(({ teamId }) => teamId);
  const playersByTeam = collectCalculatedPlayersByTeam(calculatedPlayers);

  return seriesAggregationSchema.parse({
    status: "resolved",
    gamesPlayed: matches.length,
    completedGameCount: collapsedMatches.length,
    teams: mapSeriesTeams(calculatedTeams, matches, collapsedMatches, participationByPlayerId, options),
    players: mapSeriesPlayers(
      teamIds,
      participationByPlayerId,
      collectOverallCalculatedPlayers(calculatedPlayers),
      playersByTeam,
      options,
    ),
  });
}
