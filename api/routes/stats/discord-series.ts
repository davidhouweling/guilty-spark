import type { APIEmbed, APIMessage } from "discord-api-types/v10";
import { EmbedType, MessageSearchAuthorType, MessageSearchSortMode } from "discord-api-types/v10";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  discordSeriesStatsContract,
  discordSeriesStatsParamsSchema,
  type DiscordSeriesStats,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { DiscordError } from "../../services/discord/discord-error";
import { EmbedColors } from "../../embeds/colors";
import type { RoutesRegisterHandler } from "../base/types";

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

export const statsDiscordSeriesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/discord/:guildId/:queueNumber", async (request, env: Env) => {
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
      const cached = await env.APP_DATA.get<DiscordSeriesStats>(cacheKey, { type: "json" });
      if (cached != null && typeof cached === "object") {
        const cachedParseResult = discordSeriesStatsContract.safeParse(cached);
        if (cachedParseResult.success) {
          if (cachedParseResult.data.status === "resolved") {
            return discordSeriesStatsContract.toResponse(cachedParseResult.data, {
              status: 200,
              headers: { "Cache-Control": RESOLVED_CACHE_CONTROL_HEADER },
            });
          }

          return discordSeriesStatsContract.toResponse(
            cachedParseResult.data,
            getResponseOptions(cachedParseResult.data),
          );
        }

        logService.warn(
          "Invalid cached discord series stats payload, treating as cache miss",
          new Map([["cacheKey", cacheKey]]),
        );
      }

      const searchResponse = await discordService.searchGuildMessages(guildId, {
        content: `Series stats for queue #${queueNumber.toString()}`,
        author_id: [env.DISCORD_APP_ID],
        author_type: [MessageSearchAuthorType.Bot],
        sort_by: MessageSearchSortMode.Timestamp,
        sort_order: "desc",
        limit: 25,
      });

      if ("retry_after" in searchResponse) {
        const retryAfterSeconds = sanitizeRetryAfterSeconds(searchResponse.retry_after);

        const pendingResponse: DiscordSeriesStats = {
          status: "pending-index",
          guildId,
          queueNumber,
          retryAfterSeconds,
        };
        await env.APP_DATA.put(cacheKey, JSON.stringify(pendingResponse), { expirationTtl: PENDING_CACHE_TTL_SECONDS });

        return discordSeriesStatsContract.toResponse(pendingResponse, getResponseOptions(pendingResponse));
      }

      const flattenedMessages = searchResponse.messages.flatMap((messages: APIMessage[]): APIMessage[] => messages);
      const blueOverviewCandidates = flattenedMessages.filter(
        (message: APIMessage) => getOverviewEmbed(message, queueNumber) != null,
      );

      if (blueOverviewCandidates.length === 0) {
        const notFoundResponse: DiscordSeriesStats = {
          status: "not-found",
          guildId,
          queueNumber,
          reason: "No matching series overview embeds found",
        };

        await env.APP_DATA.put(cacheKey, JSON.stringify(notFoundResponse), {
          expirationTtl: NOT_FOUND_CACHE_TTL_SECONDS,
        });

        return discordSeriesStatsContract.toResponse(notFoundResponse, { status: 404 });
      }

      const selectedOverviewMessage = Preconditions.checkExists(blueOverviewCandidates[0]);
      const matchIds = extractMatchIdsFromEmbeds(selectedOverviewMessage.embeds);

      if (matchIds.length === 0) {
        const notFoundResponse: DiscordSeriesStats = {
          status: "not-found",
          guildId,
          queueNumber,
          reason: "Series overview embed found but no match IDs were discoverable",
        };

        await env.APP_DATA.put(cacheKey, JSON.stringify(notFoundResponse), {
          expirationTtl: NOT_FOUND_CACHE_TTL_SECONDS,
        });

        return discordSeriesStatsContract.toResponse(notFoundResponse, { status: 404 });
      }

      const resolvedResponse: DiscordSeriesStats = {
        status: "resolved",
        guildId,
        queueNumber,
        matchIds,
      };

      await env.APP_DATA.put(cacheKey, JSON.stringify(resolvedResponse), { expirationTtl: RESOLVED_CACHE_TTL_SECONDS });

      return discordSeriesStatsContract.toResponse(resolvedResponse, {
        status: 200,
        headers: { "Cache-Control": RESOLVED_CACHE_CONTROL_HEADER },
      });
    } catch (error) {
      if (error instanceof DiscordError && error.httpStatus === 429) {
        const retryAfterSeconds = sanitizeRetryAfterSeconds((error.restError as { retry_after?: unknown }).retry_after);

        const pendingResponse: DiscordSeriesStats = {
          status: "pending-index",
          guildId,
          queueNumber,
          retryAfterSeconds,
        };

        await env.APP_DATA.put(cacheKey, JSON.stringify(pendingResponse), {
          expirationTtl: PENDING_CACHE_TTL_SECONDS,
        });

        return discordSeriesStatsContract.toResponse(pendingResponse, getResponseOptions(pendingResponse));
      }

      if (error instanceof DiscordError && error.httpStatus === 403) {
        return discordSeriesStatsContract.toResponse(
          {
            status: "forbidden",
            guildId,
            queueNumber,
            reason: "Missing Discord permissions or message content access",
          },
          { status: 403 },
        );
      }

      logService.error(error as Error, new Map([["message", "Failed to resolve discord series stats route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series stats" },
        { status: 500, noStore: true },
      );
    }
  });
};
