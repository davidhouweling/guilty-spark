import type {
  LiveTrackerMatchSummary,
  LiveTrackerNeatQueueSeriesData,
  LiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/types";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { collapseSequentialSeriesEntries } from "@guilty-spark/shared/halo/match-enrichment";
import { gameModeIconSrcForModeName } from "../individual-tracker/game-mode-icon";
import { isMatchStats } from "../../controllers/stats/is-match-stats";
import type {
  LiveTrackerMatchRenderModel,
  LiveTrackerPlannedGameRenderModel,
  LiveTrackerStateRenderModel,
  LiveTrackerSubstitutionRenderModel,
} from "./types";

function normalizeSeriesScore(score: string): string {
  if (/^\d+:\d+$/.test(score)) {
    return score;
  }

  return "0:0";
}

export function getMatchGameInfo(
  summary: LiveTrackerMatchSummary,
  rawMatches: LiveTrackerStateMessage["data"]["rawMatches"],
): LiveTrackerMatchSummary["gameInfo"] {
  const raw = rawMatches[summary.matchId];
  if (summary.gameInfo != null || !isMatchStats(raw)) {
    return summary.gameInfo;
  }
  return {
    mapAssetId: raw.MatchInfo.MapVariant.AssetId,
    mapVersionId: raw.MatchInfo.MapVariant.VersionId,
    gameVariantCategory: raw.MatchInfo.GameVariantCategory,
  };
}

function toMatchRenderModel(
  summary: LiveTrackerMatchSummary,
  rawMatches: LiveTrackerStateMessage["data"]["rawMatches"],
): LiveTrackerMatchRenderModel {
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
    gameInfo: getMatchGameInfo(summary, rawMatches),
  };
}

function transformNeatQueueData(seriesData: LiveTrackerStateMessage["data"]): {
  matches: readonly LiveTrackerMatchRenderModel[];
  teams: readonly {
    name: string;
    players: readonly { id: string; displayName: string }[];
  }[];
  substitutions: readonly LiveTrackerSubstitutionRenderModel[];
} {
  const matches = seriesData.matchSummaries
    .map((match) => toMatchRenderModel(match, seriesData.rawMatches))
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

function toPlannedGames(
  matches: readonly LiveTrackerMatchRenderModel[],
  plannedMaps: LiveTrackerNeatQueueSeriesData["plannedMaps"],
): readonly LiveTrackerPlannedGameRenderModel[] {
  const completedGames = collapseSequentialSeriesEntries(
    matches.flatMap((match) =>
      match.gameInfo == null ? [] : [{ startTime: match.startTime, ...match.gameInfo, match }],
    ),
  );

  const completedGameCount = completedGames.length;
  return (plannedMaps ?? []).slice(completedGameCount).map((planned, index) => {
    const matchingMap = matches.find((match) => match.gameMap === planned.map);
    return {
      gameNumber: completedGameCount + index + 1,
      mode: planned.mode,
      map: planned.map,
      gameMapThumbnailUrl: matchingMap?.gameMapThumbnailUrl ?? "data:,",
      gameModeIconUrl: gameModeIconSrcForModeName(planned.mode),
    };
  });
}

export function toLiveTrackerStateRenderModel(
  message: LiveTrackerStateMessage,
  medalMetadata: MedalMetadata,
): LiveTrackerStateRenderModel {
  const { matches, teams, substitutions } = transformNeatQueueData(message.data);

  return {
    type: "neatqueue",
    guildName: message.data.guildName,
    guildId: message.data.guildId,
    guildIcon: message.data.guildIcon,
    queueNumber: message.data.queueNumber,
    status: message.data.status,
    seriesStartedAt: message.data.seriesStartedAt,
    lastUpdateTime: message.data.lastUpdateTime,
    teams,
    matches,
    plannedGames: toPlannedGames(matches, message.data.plannedMaps),
    substitutions,
    seriesScore: normalizeSeriesScore(message.data.seriesScore),
    medalMetadata,
    playersAssociationData: message.data.playersAssociationData,
    seriesData:
      message.data.seriesData != null
        ? {
            seriesId: message.data.seriesData.seriesId,
            teams: message.data.seriesData.teams,
            seriesScore: normalizeSeriesScore(message.data.seriesData.seriesScore),
            matchIds: message.data.seriesData.matchIds,
            startTime: message.data.seriesData.startTime,
            lastUpdateTime: message.data.seriesData.lastUpdateTime,
          }
        : undefined,
  };
}
