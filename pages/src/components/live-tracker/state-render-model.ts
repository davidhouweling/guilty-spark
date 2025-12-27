import type { LiveTrackerMatchSummary, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerMatchRenderModel, LiveTrackerStateRenderModel } from "./types";

function getPlayerDisplayName(
  member: LiveTrackerStateMessage["data"]["players"][string] | undefined,
  id: string,
): string {
  if (!member) {
    return id;
  }

  if (member.nick !== null && member.nick.length > 0) {
    return member.nick;
  }

  if (member.user.global_name !== null && member.user.global_name.length > 0) {
    return member.user.global_name;
  }

  if (member.user.username.length > 0) {
    return member.user.username;
  }

  return id;
}

function toMatchRenderModel(summary: LiveTrackerMatchSummary): LiveTrackerMatchRenderModel {
  return {
    matchId: summary.matchId,
    gameTypeAndMap: summary.gameTypeAndMap,
    duration: summary.duration,
    gameScore: summary.gameScore,
    endTime: summary.endTime,
  };
}

export function toLiveTrackerStateRenderModel(message: LiveTrackerStateMessage): LiveTrackerStateRenderModel {
  const matches = Object.values(message.data.discoveredMatches)
    .map((match) => toMatchRenderModel(match))
    .sort((a, b) => a.endTime.localeCompare(b.endTime));

  const teams = message.data.teams.map((team) => {
    const players = team.playerIds.map((playerId) => {
      const member = message.data.players[playerId];
      return {
        id: playerId,
        displayName: getPlayerDisplayName(member, playerId),
      };
    });

    return {
      name: team.name,
      players,
    };
  });

  return {
    userId: message.data.userId,
    queueNumber: message.data.queueNumber,
    status: message.data.status,
    lastUpdateTime: message.data.lastUpdateTime,
    teams,
    matches,
  };
}
