import type { MatchStats } from "halo-infinite-api";
import type { APIEmbed, APIMessage } from "discord-api-types/v10";
import { EmbedType } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getMedalMetadataFromMatches } from "@guilty-spark/shared/halo/medals";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { EmbedColors } from "../../embeds/colors";
import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";
import type { DiscordService } from "./discord";

const MATCH_ID_REGEX = /https:\/\/halodatahive\.com\/Infinite\/Match\/([a-zA-Z0-9-]+)/g;

export const DISCORD_SERIES_STATS_RESOLVED_CACHE_TTL_SECONDS = 60 * 60 * 24;
export const DISCORD_SERIES_STATS_RESOLVED_STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;
export const DISCORD_SERIES_STATS_RESOLVED_CACHE_CONTROL_HEADER = `public, s-maxage=${DISCORD_SERIES_STATS_RESOLVED_CACHE_TTL_SECONDS.toString()}, stale-while-revalidate=${DISCORD_SERIES_STATS_RESOLVED_STALE_WHILE_REVALIDATE_SECONDS.toString()}`;

export function getDiscordSeriesStatsCacheKey(guildId: string, queueNumber: number): string {
  return `stats:discord:series:${guildId}:${queueNumber.toString()}`;
}

export function getDiscordSeriesOverviewEmbed(message: APIMessage, queueNumber: number): APIEmbed | null {
  for (const embed of message.embeds) {
    if (embed.type !== EmbedType.Rich) {
      continue;
    }
    if (embed.color !== EmbedColors.INFO) {
      continue;
    }

    const match = embed.title?.match(/^Series stats for queue #(\d+)\b/);
    if (match?.[1] !== queueNumber.toString()) {
      continue;
    }

    return embed;
  }

  return null;
}

export function extractDiscordSeriesMatchIdsFromEmbeds(embeds: readonly APIEmbed[]): string[] {
  const matchIds = new Set<string>();

  for (const embed of embeds) {
    const gameFieldValue = embed.fields?.find((field) => field.name === "Game")?.value;
    if (gameFieldValue == null) {
      continue;
    }

    const matches = gameFieldValue.matchAll(MATCH_ID_REGEX);
    for (const match of matches) {
      const [, matchId] = match;
      if (matchId != null) {
        matchIds.add(matchId);
      }
    }
  }

  return [...matchIds];
}

function splitGameTypeAndMap(gameTypeAndMap: string): { gameType: string; gameMap: string } {
  const colonSplit = gameTypeAndMap.split(":");
  if (colonSplit.length > 1) {
    const gameType = (colonSplit[0] ?? "*Unknown Game Type*").trim() || "*Unknown Game Type*";
    const gameMap = colonSplit.slice(1).join(":").trim() || "*Unknown Map*";
    return { gameType, gameMap };
  }

  const separator = " on ";
  const onIndex = gameTypeAndMap.indexOf(separator);
  if (onIndex > 0) {
    const gameType = gameTypeAndMap.slice(0, onIndex).trim();
    const gameMap = gameTypeAndMap.slice(onIndex + separator.length).trim();
    return {
      gameType: gameType || "*Unknown Game Type*",
      gameMap: gameMap || "*Unknown Map*",
    };
  }

  return { gameType: "*Unknown Game Type*", gameMap: "*Unknown Map*" };
}

function getTeamPlayersFromMatch(match: MatchStats, teamId: number): MatchStats["Players"] {
  return match.Players.filter((player) => {
    if (!player.ParticipationInfo.PresentAtBeginning) {
      return false;
    }

    return player.PlayerTeamStats.some((teamStats) => teamStats.TeamId === teamId);
  });
}

async function getSubtitle(guildId: string, discordService: DiscordService, logService: LogService): Promise<string> {
  let subtitle = `Guild ${guildId}`;
  try {
    const guild = await discordService.getGuild(guildId);
    const guildName = guild.name.trim();
    subtitle = guildName === "" ? `Guild ${guildId}` : guildName;
  } catch (error) {
    logService.warn(
      "Failed to fetch guild name for discord series subtitle, falling back to guild id",
      new Map([
        ["guildId", guildId],
        ["error", String(error)],
      ]),
    );
  }
  return subtitle;
}

async function getBestEffortMedalMetadata({
  logService,
  haloService,
  matchesById,
  guildId,
  queueNumber,
}: {
  logService: LogService;
  haloService: HaloService;
  matchesById: Record<string, MatchStats>;
  guildId: string;
  queueNumber: number;
}): Promise<DiscordSeriesStatsResolved["renderData"]["medalMetadata"]> {
  try {
    return await getMedalMetadataFromMatches(matchesById, async (medalId) => haloService.getMedal(medalId));
  } catch (error) {
    logService.warn(
      "Failed to resolve medal metadata for discord series stats, using empty metadata",
      new Map([
        ["guildId", guildId],
        ["queueNumber", queueNumber.toString()],
        ["error", String(error)],
      ]),
    );
    return {};
  }
}

export async function buildDiscordSeriesRenderDataFromMatches({
  discordService,
  logService,
  haloService,
  guildId,
  queueNumber,
  matches,
}: {
  discordService: DiscordService;
  logService: LogService;
  haloService: HaloService;
  guildId: string;
  queueNumber: number;
  matches: MatchStats[];
}): Promise<DiscordSeriesStatsResolved["renderData"]> {
  if (matches.length === 0) {
    throw new Error("No Halo match details were found for discovered match IDs");
  }

  const matchesById: Record<string, MatchStats> = {};
  for (const match of matches) {
    matchesById[match.MatchId] = match;
  }

  const [playerXuidToGametagMap, medalMetadata] = await Promise.all([
    haloService.getPlayerXuidsToGametags(matches),
    getBestEffortMedalMetadata({
      logService,
      haloService,
      matchesById,
      guildId,
      queueNumber,
    }),
  ]);

  const renderMatches = await Promise.all(
    matches.map(async (match) => {
      const [gameTypeAndMap, mapThumbnailUrl] = await Promise.all([
        haloService.getGameTypeAndMap(match.MatchInfo),
        haloService.getMapThumbnailUrl(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
      ]);
      const { gameType, gameMap } = splitGameTypeAndMap(gameTypeAndMap);
      const { gameScore, gameSubScore } = haloService.getMatchScore(match, "en-US");

      const playerXuidToGametag: Record<string, string> = {};
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning || player.PlayerType !== 1) {
          continue;
        }

        const xuid = getPlayerXuid(player);
        playerXuidToGametag[xuid] = playerXuidToGametagMap.get(xuid) ?? "*Unknown*";
      }

      return {
        matchId: match.MatchId,
        gameTypeAndMap,
        gameVariantCategory: match.MatchInfo.GameVariantCategory,
        gameType,
        gameMap,
        gameMapThumbnailUrl: mapThumbnailUrl ?? "data:,",
        duration: getReadableDuration(match.MatchInfo.Duration, "en-US"),
        gameScore,
        gameSubScore,
        startTime: new Date(match.MatchInfo.StartTime).toISOString(),
        endTime: new Date(match.MatchInfo.EndTime).toISOString(),
        playerXuidToGametag,
        rawMatch: match,
      };
    }),
  );

  const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);
  const teams = lastMatch.Teams.map((team) => ({
    name: getTeamName(team.TeamId),
    players: getTeamPlayersFromMatch(lastMatch, team.TeamId).map((player) => {
      if (player.PlayerType !== 1) {
        return "Bot";
      }

      const xuid = getPlayerXuid(player);
      return playerXuidToGametagMap.get(xuid) ?? "*Unknown*";
    }),
  }));

  const subtitle = await getSubtitle(guildId, discordService, logService);

  return {
    title: `Queue #${queueNumber.toString()} Series Stats`,
    subtitle,
    seriesScore: haloService.getSeriesScore(matches, "en-US"),
    medalMetadata,
    teams,
    matches: renderMatches,
  };
}
