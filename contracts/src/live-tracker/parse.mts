import type { MatchStats } from "halo-infinite-api";
import {
  readJsonArray,
  readJsonObject,
  readNumber,
  readRecord,
  readString,
  readStringRecord,
} from "../base/json-readers.mjs";
import type { JsonValue } from "../base/json.mts";
import type {
  LiveTrackerPlayer,
  LiveTrackerMatchSummary,
  LiveTrackerMessage,
  LiveTrackerStatus,
  LiveTrackerNeatQueueStateData,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
  PlayerAssociationData,
} from "./types.mts";

function parseStatus(value: JsonValue): LiveTrackerStatus | null {
  const status = readString(value);
  if (status === "active" || status === "paused" || status === "stopped") {
    return status;
  }
  return null;
}

function parsePlayer(value: JsonValue): LiveTrackerPlayer | null {
  const player = readJsonObject(value);
  if (!player) {
    return null;
  }

  const id = readString(player["id"] ?? null);
  const discordUsername = readString(player["discordUsername"] ?? null);
  if (id === null || discordUsername === null) {
    return null;
  }

  return {
    id,
    discordUsername,
  };
}

function parseSubstitution(value: JsonValue): LiveTrackerNeatQueueStateData["substitutions"][number] | null {
  const substitution = readJsonObject(value);
  if (!substitution) {
    return null;
  }

  const playerOutId = readString(substitution["playerOutId"] ?? null);
  const playerInId = readString(substitution["playerInId"] ?? null);
  const teamIndex = readNumber(substitution["teamIndex"] ?? null);
  const teamName = readString(substitution["teamName"] ?? null);
  const timestamp = readString(substitution["timestamp"] ?? null);

  if (playerOutId === null || playerInId === null || teamIndex === null || teamName === null || timestamp === null) {
    return null;
  }

  return {
    playerOutId,
    playerInId,
    teamIndex,
    teamName,
    timestamp,
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
  const gameType = readString(match["gameType"] ?? null);
  const gameMap = readString(match["gameMap"] ?? null);
  const gameMapThumbnailUrl = readString(match["gameMapThumbnailUrl"] ?? null);
  const duration = readString(match["duration"] ?? null);
  const gameScore = readString(match["gameScore"] ?? null);
  const gameSubScore = readString(match["gameSubScore"] ?? null);
  const startTime = readString(match["startTime"] ?? null);
  const endTime = readString(match["endTime"] ?? null);
  const playerXuidToGametag = readStringRecord(match["playerXuidToGametag"] ?? null);

  if (
    matchId === null ||
    gameTypeAndMap === null ||
    gameType === null ||
    gameMap === null ||
    gameMapThumbnailUrl === null ||
    duration === null ||
    gameScore === null ||
    startTime === null ||
    endTime === null ||
    playerXuidToGametag === null
  ) {
    return null;
  }

  return {
    matchId,
    gameTypeAndMap,
    gameType,
    gameMap,
    gameMapThumbnailUrl,
    duration,
    gameScore,
    gameSubScore,
    startTime,
    endTime,
    playerXuidToGametag,
  };
}

export function parseLiveTrackerStateData(value: JsonValue): LiveTrackerNeatQueueStateData | null {
  const data = readJsonObject(value);
  if (!data) {
    return null;
  }

  const guildId = readString(data["guildId"] ?? null);
  const guildIcon = readString(data["guildIcon"] ?? null);
  const guildName = readString(data["guildName"] ?? null);
  const channelId = readString(data["channelId"] ?? null);
  const queueNumber = readNumber(data["queueNumber"] ?? null);
  const status = parseStatus(data["status"] ?? null);
  const lastUpdateTime = readString(data["lastUpdateTime"] ?? null);
  const playersArray = readJsonArray(data["players"] ?? null);
  const teamsArray = readJsonArray(data["teams"] ?? null);
  const substitutionsArray = readJsonArray(data["substitutions"] ?? null);
  const matchesArray = readJsonArray(data["matchSummaries"] ?? null);
  const rawMatches = readRecord<string, MatchStats>(data["rawMatches"] ?? null);
  const seriesScore = readString(data["seriesScore"] ?? null);
  const medalMetadata = readRecord<string, { name: string; sortingWeight: number }>(data["medalMetadata"] ?? null);
  const playersAssociationDataValue = data["playersAssociationData"] ?? null;

  if (
    guildId === null ||
    guildName === null ||
    channelId === null ||
    queueNumber === null ||
    status === null ||
    lastUpdateTime === null ||
    playersArray === null ||
    teamsArray === null ||
    substitutionsArray === null ||
    matchesArray === null ||
    rawMatches === null ||
    seriesScore === null ||
    medalMetadata === null
  ) {
    return null;
  }

  // Parse playersAssociationData - it's optional so can be null
  let playersAssociationData: Record<string, PlayerAssociationData> | null = null;
  if (playersAssociationDataValue !== null) {
    const playersAssociationDataObj = readJsonObject(playersAssociationDataValue);
    if (playersAssociationDataObj !== null) {
      playersAssociationData = playersAssociationDataObj as unknown as Record<string, PlayerAssociationData>;
    }
  }

  const players: LiveTrackerPlayer[] = [];
  for (const playerValue of playersArray) {
    const player = parsePlayer(playerValue);
    if (!player) {
      return null;
    }
    players.push(player);
  }

  const teams: LiveTrackerTeam[] = [];
  for (const teamValue of teamsArray) {
    const team = parseTeam(teamValue);
    if (!team) {
      return null;
    }
    teams.push(team);
  }

  const substitutions: {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    teamName: string;
    timestamp: string;
  }[] = [];
  for (const substitutionValue of substitutionsArray) {
    const substitution = parseSubstitution(substitutionValue);
    if (!substitution) {
      return null;
    }
    substitutions.push(substitution);
  }

  const matchSummaries: LiveTrackerMatchSummary[] = [];
  for (const matchValue of matchesArray) {
    const match = parseMatchSummary(matchValue);
    if (!match) {
      return null;
    }
    matchSummaries.push(match);
  }

  return {
    type: "neatqueue",
    guildId,
    guildIcon,
    guildName,
    channelId,
    queueNumber,
    status,
    players,
    teams,
    substitutions,
    matchSummaries,
    rawMatches,
    seriesScore,
    lastUpdateTime,
    medalMetadata,
    playersAssociationData,
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
  if (typeValue === null || typeValue !== "state") {
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
