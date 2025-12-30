import type { LiveTrackerMatchSummary, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import { Preconditions } from "../../base/preconditions.mts";
import type { LiveTrackerMatchRenderModel, LiveTrackerStateRenderModel } from "./types";

function toMatchRenderModel(summary: LiveTrackerMatchSummary): LiveTrackerMatchRenderModel {
  return {
    matchId: summary.matchId,
    gameTypeAndMap: summary.gameTypeAndMap,
    gameType: summary.gameType,
    gameTypeIconUrl: summary.gameTypeIconUrl,
    gameTypeThumbnailUrl: summary.gameTypeThumbnailUrl,
    gameMap: summary.gameMap,
    gameMapThumbnailUrl: summary.gameMapThumbnailUrl,
    duration: summary.duration,
    gameScore: summary.gameScore,
    endTime: summary.endTime,
  };
}

export function toLiveTrackerStateRenderModel(message: LiveTrackerStateMessage): LiveTrackerStateRenderModel {
  const matches = message.data.discoveredMatches
    .map((match) => toMatchRenderModel(match))
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

  return {
    guildName: message.data.guildName,
    queueNumber: message.data.queueNumber,
    status: message.data.status,
    lastUpdateTime: message.data.lastUpdateTime,
    teams,
    matches,
  };
}
