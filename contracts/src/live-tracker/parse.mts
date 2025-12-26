import { readJsonArray, readJsonObject, readNullableString, readNumber, readString } from "../base/json-readers.mjs";
import type { JsonValue } from "../base/json.mts";
import type {
  LiveTrackerGuildMember,
  LiveTrackerMatchSummary,
  LiveTrackerMessage,
  LiveTrackerStateData,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
} from "./types.mts";

function parseGuildMember(value: JsonValue): LiveTrackerGuildMember {
  const member = readJsonObject(value);
  if (!member) {
    throw new Error("Invalid guild member payload");
  }

  const user = readJsonObject(member["user"] ?? null);
  if (!user) {
    throw new Error("Invalid guild member payload");
  }

  const id = readString(user["id"] ?? null);
  const username = readString(user["username"] ?? null);
  const global_name = readNullableString(user["global_name"] ?? null);
  const avatar = readNullableString(user["avatar"] ?? null);
  const nick = readNullableString(member["nick"] ?? null);

  if (id === null || username === null) {
    throw new Error("Invalid guild member payload");
  }

  return {
    nick,
    user: {
      id,
      username,
      global_name,
      avatar,
    },
  };
}

function parseTeam(value: JsonValue): LiveTrackerTeam | null {
  const team = readJsonObject(value);
  if (!team) {
    return null;
  }

  const name = readString(team["name"] ?? null);
  const playerIdsArray = readJsonArray(team["playerIds"] ?? null);
  if (name === null || playerIdsArray === null) {
    return null;
  }

  const playerIds: string[] = [];
  for (const playerIdValue of playerIdsArray) {
    const playerId = readString(playerIdValue);
    if (playerId === null) {
      return null;
    }
    playerIds.push(playerId);
  }

  return {
    name,
    playerIds,
  };
}

function parseMatchSummary(value: JsonValue): LiveTrackerMatchSummary | null {
  const match = readJsonObject(value);
  if (!match) {
    return null;
  }

  const matchId = readString(match["matchId"] ?? null);
  const gameTypeAndMap = readString(match["gameTypeAndMap"] ?? null);
  const duration = readString(match["duration"] ?? null);
  const gameScore = readString(match["gameScore"] ?? null);
  const endTime = readString(match["endTime"] ?? null);

  if (matchId === null || gameTypeAndMap === null || duration === null || gameScore === null || endTime === null) {
    return null;
  }

  return {
    matchId,
    gameTypeAndMap,
    duration,
    gameScore,
    endTime,
  };
}

export function parseLiveTrackerStateData(value: JsonValue): LiveTrackerStateData | null {
  const data = readJsonObject(value);
  if (!data) {
    return null;
  }

  const userId = readString(data["userId"] ?? null);
  const guildId = readString(data["guildId"] ?? null);
  const channelId = readString(data["channelId"] ?? null);
  const queueNumber = readNumber(data["queueNumber"] ?? null);
  const status = readString(data["status"] ?? null);
  const lastUpdateTime = readString(data["lastUpdateTime"] ?? null);
  const playersObj = readJsonObject(data["players"] ?? null);
  const teamsArray = readJsonArray(data["teams"] ?? null);
  const matchesObj = readJsonObject(data["discoveredMatches"] ?? null);

  if (
    userId === null ||
    guildId === null ||
    channelId === null ||
    queueNumber === null ||
    status === null ||
    lastUpdateTime === null ||
    playersObj === null ||
    teamsArray === null ||
    matchesObj === null
  ) {
    return null;
  }

  const players: Record<string, LiveTrackerGuildMember> = {};
  for (const playerId of Object.keys(playersObj)) {
    const memberValue = playersObj[playerId] ?? null;
    try {
      players[playerId] = parseGuildMember(memberValue);
    } catch {
      return null;
    }
  }

  const teams: LiveTrackerTeam[] = [];
  for (const teamValue of teamsArray) {
    const team = parseTeam(teamValue);
    if (!team) {
      return null;
    }
    teams.push(team);
  }

  const discoveredMatches: Record<string, LiveTrackerMatchSummary> = {};
  for (const matchKey of Object.keys(matchesObj)) {
    const matchValue = matchesObj[matchKey] ?? null;
    const match = parseMatchSummary(matchValue);
    if (!match) {
      return null;
    }
    discoveredMatches[matchKey] = match;
  }

  return {
    userId,
    guildId,
    channelId,
    queueNumber,
    status,
    players,
    teams,
    discoveredMatches,
    lastUpdateTime,
  };
}

export function tryParseLiveTrackerMessage(payload: string): LiveTrackerMessage | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(payload) as JsonValue;
  } catch {
    return null;
  }

  const root = readJsonObject(parsed);
  if (!root) {
    return null;
  }

  const typeValue = readString(root["type"] ?? null);
  if (typeValue === null) {
    return null;
  }

  if (typeValue === "stopped") {
    return { type: "stopped" };
  }

  if (typeValue !== "state") {
    return null;
  }

  const timestamp = readString(root["timestamp"] ?? null);
  const data = parseLiveTrackerStateData(root["data"] ?? null);
  if (timestamp === null || data === null) {
    return null;
  }

  const message: LiveTrackerStateMessage = {
    type: "state",
    data,
    timestamp,
  };

  return message;
}
