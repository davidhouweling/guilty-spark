import type { LiveTrackerMatchSummary, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "../../base/preconditions.mts";
import type {
  LiveTrackerMatchRenderModel,
  LiveTrackerStateRenderModel,
  LiveTrackerSubstitutionRenderModel,
} from "./types";

function toMatchRenderModel(
  summary: LiveTrackerMatchSummary,
  rawMatches: Record<string, unknown>,
): LiveTrackerMatchRenderModel {
  const rawMatchStats = rawMatches[summary.matchId];
  return {
    matchId: summary.matchId,
    gameTypeAndMap: summary.gameTypeAndMap,
    gameType: summary.gameType,
    gameMap: summary.gameMap,
    gameMapThumbnailUrl: summary.gameMapThumbnailUrl,
    duration: summary.duration,
    gameScore: summary.gameScore,
    gameSubScore: summary.gameSubScore,
    endTime: summary.endTime,
    rawMatchStats: (rawMatchStats ?? null) as MatchStats | null,
    playerXuidToGametag: summary.playerXuidToGametag,
  };
}

export function toLiveTrackerStateRenderModel(message: LiveTrackerStateMessage): LiveTrackerStateRenderModel {
  const matches = message.data.discoveredMatches
    .map((match) => toMatchRenderModel(match, message.data.rawMatches))
    .sort((a, b) => a.endTime.localeCompare(b.endTime));

  const playersById = new Map(message.data.players.map((player) => [player.id, player] as const));

  const teams = message.data.teams.map((team) => {
    const players = team.playerIds.map((playerId) => {
      const member = Preconditions.checkExists(
        playersById.get(playerId),
        `Missing player '${playerId}' from state players list`,
      );
      return {
        id: playerId,
        displayName: member.discordUsername,
      };
    });

    return {
      name: team.name,
      players,
    };
  });

  const substitutions: LiveTrackerSubstitutionRenderModel[] = message.data.substitutions.map((sub) => {
    const playerOut = Preconditions.checkExists(
      playersById.get(sub.playerOutId),
      `Missing player out '${sub.playerOutId}' from state players list`,
    );
    const playerIn = Preconditions.checkExists(
      playersById.get(sub.playerInId),
      `Missing player in '${sub.playerInId}' from state players list`,
    );
    const team = Preconditions.checkExists(
      message.data.teams[sub.teamIndex],
      `Invalid team index '${sub.teamIndex.toString()}'`,
    );

    return {
      playerOutId: sub.playerOutId,
      playerOutDisplayName: playerOut.discordUsername,
      playerInId: sub.playerInId,
      playerInDisplayName: playerIn.discordUsername,
      teamName: team.name,
      timestamp: sub.timestamp,
    };
  });

  return {
    guildName: message.data.guildName,
    queueNumber: message.data.queueNumber,
    status: message.data.status,
    lastUpdateTime: message.data.lastUpdateTime,
    teams,
    matches,
    substitutions,
    seriesScore: message.data.seriesScore,
  };
}
