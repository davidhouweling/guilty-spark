import type {
  LiveTrackerMatchSummary,
  LiveTrackerNeatQueueSeriesData,
  LiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/types";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
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
    startTime: summary.startTime,
    endTime: summary.endTime,
    rawMatchStats: (rawMatchStats ?? null) as MatchStats | null,
    playerXuidToGametag: summary.playerXuidToGametag,
  };
}

function transformNeatQueueData(
  seriesData: LiveTrackerNeatQueueSeriesData,
  rawMatches: Record<string, unknown>,
): {
  matches: readonly LiveTrackerMatchRenderModel[];
  teams: readonly {
    name: string;
    players: readonly { id: string; displayName: string }[];
  }[];
  substitutions: readonly LiveTrackerSubstitutionRenderModel[];
} {
  const matches = seriesData.matchSummaries
    .map((match) => toMatchRenderModel(match, rawMatches))
    .sort((a, b) => a.endTime.localeCompare(b.endTime));

  const playersById = new Map(seriesData.players.map((player) => [player.id, player] as const));

  const teams = seriesData.teams.map((team) => {
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

  const substitutions: LiveTrackerSubstitutionRenderModel[] = seriesData.substitutions.map((sub) => {
    const playerOut = Preconditions.checkExists(
      playersById.get(sub.playerOutId),
      `Missing player out '${sub.playerOutId}' from state players list`,
    );
    const playerIn = Preconditions.checkExists(
      playersById.get(sub.playerInId),
      `Missing player in '${sub.playerInId}' from state players list`,
    );
    const team = Preconditions.checkExists(
      seriesData.teams[sub.teamIndex],
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

  return { matches, teams, substitutions };
}

export function toLiveTrackerStateRenderModel(message: LiveTrackerStateMessage): LiveTrackerStateRenderModel {
  const { matches, teams, substitutions } = transformNeatQueueData(message.data, message.data.rawMatches);

  return {
    type: "neatqueue",
    guildName: message.data.guildName,
    guildId: message.data.guildId,
    guildIcon: message.data.guildIcon,
    queueNumber: message.data.queueNumber,
    status: message.data.status,
    lastUpdateTime: message.data.lastUpdateTime,
    teams,
    matches,
    substitutions,
    seriesScore: message.data.seriesScore,
    medalMetadata: message.data.medalMetadata,
    playersAssociationData: message.data.playersAssociationData,
    seriesData:
      message.data.seriesData != null
        ? {
            seriesId: message.data.seriesData.seriesId,
            teams: message.data.seriesData.teams,
            seriesScore: message.data.seriesData.seriesScore,
            matchIds: message.data.seriesData.matchIds,
            startTime: message.data.seriesData.startTime,
            lastUpdateTime: message.data.seriesData.lastUpdateTime,
          }
        : undefined,
  };
}
