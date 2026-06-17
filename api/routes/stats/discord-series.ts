import type { APIEmbed, APIMessage } from "discord-api-types/v10";
import { EmbedType, MessageSearchAuthorType, MessageSearchSortMode } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getMedalMetadataFromMatches } from "@guilty-spark/shared/halo/medals";
import {
  discordSeriesStatsContract,
  discordSeriesStatsParamsSchema,
  type DiscordSeriesStats,
  type DiscordSeriesStatsForbidden,
  type DiscordSeriesStatsNotFound,
  type DiscordSeriesStatsPending,
  type DiscordSeriesStatsResolved,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { DiscordError } from "../../services/discord/discord-error";
import type { DiscordService } from "../../services/discord/discord";
import { EmbedColors } from "../../embeds/colors";
import type { RoutesRegisterHandler } from "../base/types";
import type { HaloService } from "../../services/halo/halo";
import type { LogService } from "../../services/log/types";

const DEFAULT_PENDING_RETRY_SECONDS = 2;
const PENDING_CACHE_TTL_SECONDS = 60 * 5;
const RESOLVED_CACHE_TTL_SECONDS = 60 * 60 * 24;
const NOT_FOUND_CACHE_TTL_SECONDS = 60 * 5;
const RESOLVED_STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;
const RESOLVED_CACHE_CONTROL_HEADER = `public, s-maxage=${RESOLVED_CACHE_TTL_SECONDS.toString()}, stale-while-revalidate=${RESOLVED_STALE_WHILE_REVALIDATE_SECONDS.toString()}`;

const MATCH_ID_REGEX = /https:\/\/halodatahive\.com\/Infinite\/Match\/([a-zA-Z0-9-]+)/g;

function getCacheKey(guildId: string, queueNumber: number): string {
  return `stats:discord:series:${guildId}:${queueNumber.toString()}`;
}

function getResponseOptions(response: DiscordSeriesStats): {
  status: number;
  noStore?: boolean;
  headers?: Record<string, string>;
} {
  switch (response.status) {
    case "resolved": {
      return { status: 200, headers: { "Cache-Control": RESOLVED_CACHE_CONTROL_HEADER } };
    }
    case "pending-index": {
      return {
        status: 503,
        noStore: true,
        headers: { "Retry-After": Math.ceil(response.retryAfterSeconds).toString() },
      };
    }
    case "not-found": {
      return { status: 404 };
    }
    case "forbidden": {
      return { status: 403 };
    }
    default: {
      throw new UnreachableError(response);
    }
  }
}

function getOverviewEmbed(message: APIMessage, queueNumber: number): APIEmbed | null {
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

function extractMatchIdsFromEmbeds(embeds: readonly APIEmbed[]): string[] {
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

function sanitizeRetryAfterSeconds(retryAfterValue: unknown): number {
  if (typeof retryAfterValue !== "number") {
    return DEFAULT_PENDING_RETRY_SECONDS;
  }

  if (!Number.isFinite(retryAfterValue) || retryAfterValue <= 0) {
    return DEFAULT_PENDING_RETRY_SECONDS;
  }

  return retryAfterValue;
}

type DiscordSeriesLookupResult =
  | {
      status: "resolved";
      guildId: string;
      queueNumber: number;
      matchIds: string[];
    }
  | DiscordSeriesStatsPending
  | DiscordSeriesStatsNotFound;

function getForbiddenResponseData(guildId: string, queueNumber: number): DiscordSeriesStatsForbidden {
  return {
    status: "forbidden",
    guildId,
    queueNumber,
    reason: "Missing Discord permissions or message content access",
  };
}

async function cachePendingResponse({
  env,
  cacheKey,
  guildId,
  queueNumber,
  retryAfterSeconds,
}: {
  env: Env;
  cacheKey: string;
  guildId: string;
  queueNumber: number;
  retryAfterSeconds: number;
}): Promise<DiscordSeriesStatsPending> {
  const pendingResponse: DiscordSeriesStatsPending = {
    status: "pending-index",
    guildId,
    queueNumber,
    retryAfterSeconds,
  };

  await env.APP_DATA.put(cacheKey, JSON.stringify(pendingResponse), {
    expirationTtl: PENDING_CACHE_TTL_SECONDS,
  });

  return pendingResponse;
}

async function cacheLookupResultWhenNeeded({
  env,
  cacheKey,
  lookupResult,
}: {
  env: Env;
  cacheKey: string;
  lookupResult: DiscordSeriesLookupResult;
}): Promise<void> {
  if (lookupResult.status === "pending-index") {
    await env.APP_DATA.put(cacheKey, JSON.stringify(lookupResult), { expirationTtl: PENDING_CACHE_TTL_SECONDS });
  }

  if (lookupResult.status === "not-found") {
    await env.APP_DATA.put(cacheKey, JSON.stringify(lookupResult), {
      expirationTtl: NOT_FOUND_CACHE_TTL_SECONDS,
    });
  }
}

async function getValidCachedStats({
  env,
  cacheKey,
  logService,
  warningMessage,
}: {
  env: Env;
  cacheKey: string;
  logService: { warn: (message: string, extra?: Map<string, string>) => void };
  warningMessage: string;
}): Promise<DiscordSeriesStats | null> {
  const cached = await env.APP_DATA.get<DiscordSeriesStats>(cacheKey, { type: "json" });
  if (cached == null || typeof cached !== "object") {
    return null;
  }

  const cachedParseResult = discordSeriesStatsContract.safeParse(cached);
  if (cachedParseResult.success) {
    return cachedParseResult.data;
  }

  logService.warn(warningMessage, new Map([["cacheKey", cacheKey]]));
  return null;
}

async function findDiscordSeriesLookupResult({
  guildId,
  queueNumber,
  discordService,
  env,
}: {
  guildId: string;
  queueNumber: number;
  discordService: DiscordService;
  env: Env;
}): Promise<DiscordSeriesLookupResult> {
  const searchResponse = await discordService.searchGuildMessages(guildId, {
    content: `Series stats for queue #${queueNumber.toString()}`,
    author_id: [env.DISCORD_APP_ID],
    author_type: [MessageSearchAuthorType.Bot],
    sort_by: MessageSearchSortMode.Timestamp,
    sort_order: "desc",
    limit: 25,
  });

  if ("retry_after" in searchResponse) {
    return {
      status: "pending-index",
      guildId,
      queueNumber,
      retryAfterSeconds: sanitizeRetryAfterSeconds(searchResponse.retry_after),
    };
  }

  const flattenedMessages = searchResponse.messages.flatMap((messages: APIMessage[]): APIMessage[] => messages);
  const blueOverviewCandidates = flattenedMessages.filter(
    (message: APIMessage) => getOverviewEmbed(message, queueNumber) != null,
  );

  if (blueOverviewCandidates.length === 0) {
    return {
      status: "not-found",
      guildId,
      queueNumber,
      reason: "No matching series overview embeds found",
    };
  }

  const selectedOverviewMessage = Preconditions.checkExists(blueOverviewCandidates[0]);
  const matchIds = extractMatchIdsFromEmbeds(selectedOverviewMessage.embeds);

  if (matchIds.length === 0) {
    return {
      status: "not-found",
      guildId,
      queueNumber,
      reason: "Series overview embed found but no match IDs were discoverable",
    };
  }

  return {
    status: "resolved",
    guildId,
    queueNumber,
    matchIds,
  };
}

function toLookupResponse(lookupResult: DiscordSeriesLookupResult | DiscordSeriesStatsForbidden): Response {
  switch (lookupResult.status) {
    case "resolved": {
      return Response.json(
        {
          status: "resolved",
          guildId: lookupResult.guildId,
          queueNumber: lookupResult.queueNumber,
          matchIds: lookupResult.matchIds,
        },
        { status: 200, headers: { "Cache-Control": RESOLVED_CACHE_CONTROL_HEADER } },
      );
    }
    case "pending-index": {
      return discordSeriesStatsContract.toResponse(lookupResult, getResponseOptions(lookupResult));
    }
    case "not-found": {
      return discordSeriesStatsContract.toResponse(lookupResult, { status: 404 });
    }
    case "forbidden": {
      return discordSeriesStatsContract.toResponse(lookupResult, { status: 403 });
    }
    default: {
      throw new UnreachableError(lookupResult);
    }
  }
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

async function tryBuildRenderData({
  discordService,
  logService,
  haloService,
  guildId,
  queueNumber,
  matchIds,
}: {
  discordService: DiscordService;
  logService: LogService;
  haloService: HaloService;
  guildId: string;
  queueNumber: number;
  matchIds: string[];
}): Promise<DiscordSeriesStatsResolved["renderData"]> {
  const matches = await haloService.getMatchDetails(matchIds);
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

export const statsDiscordSeriesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/discord/:guildId/:queueNumber", async (request, env: Env) => {
    const services = installServices({ env });
    const { discordService, logService, haloService } = services;
    const parsedParams = parsePathParams(
      request.params,
      discordSeriesStatsParamsSchema,
      "Invalid guildId or queueNumber",
    );
    if (!parsedParams.success) {
      return parsedParams.response;
    }

    const { guildId, queueNumber } = parsedParams.data;
    const cacheKey = getCacheKey(guildId, queueNumber);

    try {
      const cached = await getValidCachedStats({
        env,
        cacheKey,
        logService,
        warningMessage: "Invalid cached discord series stats payload, treating as cache miss",
      });
      if (cached != null) {
        return discordSeriesStatsContract.toResponse(cached, getResponseOptions(cached));
      }

      const lookupResult = await findDiscordSeriesLookupResult({ guildId, queueNumber, discordService, env });

      if (lookupResult.status === "pending-index" || lookupResult.status === "not-found") {
        await cacheLookupResultWhenNeeded({ env, cacheKey, lookupResult });
      }

      if (lookupResult.status === "pending-index") {
        return discordSeriesStatsContract.toResponse(lookupResult, getResponseOptions(lookupResult));
      }

      if (lookupResult.status === "not-found") {
        return discordSeriesStatsContract.toResponse(lookupResult, { status: 404 });
      }

      const renderData = await tryBuildRenderData({
        discordService,
        logService,
        haloService,
        guildId,
        queueNumber,
        matchIds: lookupResult.matchIds,
      });

      const resolvedResponse: DiscordSeriesStats = {
        status: "resolved",
        guildId,
        queueNumber,
        matchIds: lookupResult.matchIds,
        renderData,
      };

      await env.APP_DATA.put(cacheKey, JSON.stringify(resolvedResponse), { expirationTtl: RESOLVED_CACHE_TTL_SECONDS });

      return discordSeriesStatsContract.toResponse(resolvedResponse, getResponseOptions(resolvedResponse));
    } catch (error) {
      if (error instanceof DiscordError && error.httpStatus === 429) {
        const retryAfterSeconds = sanitizeRetryAfterSeconds((error.restError as { retry_after?: unknown }).retry_after);
        const pendingResponse = await cachePendingResponse({
          env,
          cacheKey,
          guildId,
          queueNumber,
          retryAfterSeconds,
        });

        return discordSeriesStatsContract.toResponse(pendingResponse, getResponseOptions(pendingResponse));
      }

      if (error instanceof DiscordError && error.httpStatus === 403) {
        return discordSeriesStatsContract.toResponse(getForbiddenResponseData(guildId, queueNumber), { status: 403 });
      }

      logService.error(error, new Map([["context", "Failed to resolve discord series stats route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series stats" },
        { status: 500, noStore: true },
      );
    }
  });

  router.get("/api/stats/discord/:guildId/:queueNumber/lookup", async (request, env: Env) => {
    const services = installServices({ env });
    const { discordService, logService } = services;
    const parsedParams = parsePathParams(
      request.params,
      discordSeriesStatsParamsSchema,
      "Invalid guildId or queueNumber",
    );
    if (!parsedParams.success) {
      return parsedParams.response;
    }

    const { guildId, queueNumber } = parsedParams.data;
    const cacheKey = getCacheKey(guildId, queueNumber);

    try {
      const cached = await getValidCachedStats({
        env,
        cacheKey,
        logService,
        warningMessage: "Invalid cached discord series stats payload during lookup, treating as cache miss",
      });
      if (cached != null) {
        return toLookupResponse(cached);
      }

      const lookupResult = await findDiscordSeriesLookupResult({ guildId, queueNumber, discordService, env });

      if (lookupResult.status === "pending-index" || lookupResult.status === "not-found") {
        await cacheLookupResultWhenNeeded({ env, cacheKey, lookupResult });
      }

      return toLookupResponse(lookupResult);
    } catch (error) {
      if (error instanceof DiscordError && error.httpStatus === 429) {
        const pendingResponse = await cachePendingResponse({
          env,
          cacheKey,
          guildId,
          queueNumber,
          retryAfterSeconds: sanitizeRetryAfterSeconds((error.restError as { retry_after?: unknown }).retry_after),
        });

        return toLookupResponse(pendingResponse);
      }

      if (error instanceof DiscordError && error.httpStatus === 403) {
        return toLookupResponse(getForbiddenResponseData(guildId, queueNumber));
      }

      logService.error(error, new Map([["context", "Failed to resolve discord series stats lookup route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series stats lookup" },
        { status: 500, noStore: true },
      );
    }
  });
};
