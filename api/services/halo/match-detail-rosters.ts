import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { playerSchema, teamMappingSchema, teamSchema } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import type { Player, PlayerTeamStats, Team } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { getMatchOutcomeLabel } from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { calculateMatchStats } from "@guilty-spark/shared/halo/match-stat-calculation";
import { getMatchObjectiveStatValues } from "@guilty-spark/shared/halo/match-objective-stat-values";
import { serializeMedalDetails } from "@guilty-spark/shared/halo/medal-detail-serialization";
import { serializeStatDetails } from "@guilty-spark/shared/halo/stat-detail-serialization";
import type { MatchDetailRosterOptions } from "./types";

function validateSourceIdentities(
  match: MatchStats,
  mappings: MatchDetailRosterOptions["matchTeamIdToSeriesTeamId"],
): void {
  const teamIds = new Set(match.Teams.map((team) => team.TeamId));
  if (teamIds.size !== match.Teams.length) {
    throw new Error("Duplicate match team ID");
  }
  const playerIds = new Set(match.Players.map((player) => player.PlayerId));
  if (playerIds.size !== match.Players.length) {
    throw new Error("Duplicate raw player ID");
  }
  for (const [matchTeamId, seriesTeamId] of mappings ?? []) {
    teamMappingSchema.parse({ matchTeamId, seriesTeamId });
    if (!teamIds.has(matchTeamId)) {
      throw new Error(`Series mapping references missing match team ${String(matchTeamId)}`);
    }
  }
  for (const player of match.Players) {
    const playerTeamIds = player.PlayerTeamStats.map((stats) => stats.TeamId);
    if (player.ParticipationInfo.PresentAtBeginning && playerTeamIds.length === 0) {
      throw new Error(`Missing source team stats for eligible player ${player.PlayerId}`);
    }
    if (new Set(playerTeamIds).size !== playerTeamIds.length) {
      throw new Error(`Duplicate team stat entry for ${player.PlayerId}`);
    }
  }
}

/**
 * Keeps every source identity; legacy detailed rows only include players present at
 * the beginning. Stable series sides must be supplied by the caller, never inferred.
 */
export function mapMatchDetailRosters(
  match: MatchStats,
  options: MatchDetailRosterOptions = {},
): { teams: Team[]; players: Player[] } {
  validateSourceIdentities(match, options.matchTeamIdToSeriesTeamId);
  const calculated = calculateMatchStats(match, (stats) =>
    getMatchObjectiveStatValues(stats, match.MatchInfo.GameVariantCategory),
  );
  const metadata = options.medalMetadataById ?? {};
  const difficulties = options.medalDifficulties ?? [];
  const rowsByPlayerId = new Map<string, PlayerTeamStats[]>();

  const teams = match.Teams.map((source) => {
    const team = Preconditions.checkExists(
      calculated.teams.find((entry) => entry.teamId === source.TeamId),
      `Missing calculated match team ${String(source.TeamId)}`,
    );
    const seriesTeamId = options.matchTeamIdToSeriesTeamId?.get(source.TeamId) ?? null;
    for (const entry of team.players) {
      const rows = rowsByPlayerId.get(entry.player.PlayerId) ?? [];
      rows.push({
        matchTeamId: source.TeamId,
        seriesTeamId,
        stats: serializeStatDetails(entry.values, entry.coreStats),
        medals: serializeMedalDetails(entry.medalStats.Medals, metadata, difficulties),
      });
      rowsByPlayerId.set(entry.player.PlayerId, rows);
    }
    return teamSchema.parse({
      matchTeamId: source.TeamId,
      seriesTeamId,
      name: null,
      outcome: getMatchOutcomeLabel(source.Outcome),
      rank: source.Rank,
      playerIds: match.Players.filter(
        (player) =>
          player.LastTeamId === source.TeamId || player.PlayerTeamStats.some((stats) => stats.TeamId === source.TeamId),
      ).map((player) => player.PlayerId),
      stats: serializeStatDetails(team.values, team.coreStats),
      medals: serializeMedalDetails(team.coreStats.Medals, metadata, difficulties),
    });
  });

  const players = match.Players.map((source) => {
    const identity = options.identitiesByPlayerId?.get(source.PlayerId);
    const normalizedXuid = getPlayerXuid(source);
    const rows = rowsByPlayerId.get(source.PlayerId);
    if (
      source.ParticipationInfo.PresentAtBeginning &&
      source.PlayerTeamStats.some((stats) => match.Teams.some((team) => team.TeamId === stats.TeamId)) &&
      rows == null
    ) {
      throw new Error(`Missing calculated rows for eligible player ${source.PlayerId}`);
    }
    return playerSchema.parse({
      playerId: source.PlayerId,
      ...(/^\d+$/.test(normalizedXuid) ? { xuid: normalizedXuid } : {}),
      discordUserId: identity?.discordUserId,
      gamertag: identity?.gamertag ?? null,
      playerType: source.PlayerType,
      lastMatchTeamId: match.Teams.some((team) => team.TeamId === source.LastTeamId) ? source.LastTeamId : null,
      outcome: getMatchOutcomeLabel(source.Outcome),
      rank: source.Rank,
      participation: {
        presentAtBeginning: source.ParticipationInfo.PresentAtBeginning,
        joinedInProgress: source.ParticipationInfo.JoinedInProgress,
        leftInProgress: source.ParticipationInfo.LeftInProgress,
        presentAtCompletion: source.ParticipationInfo.PresentAtCompletion,
      },
      teamStats: rows ?? [],
    });
  });
  return { teams, players };
}
