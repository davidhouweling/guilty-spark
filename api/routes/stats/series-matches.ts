import type { MatchStats } from "halo-infinite-api";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getMedalMetadataFromMatches } from "@guilty-spark/shared/halo/medals";
import { seriesMatchesContract, seriesMatchesQuerySchema } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { RoutesRegisterHandler } from "../base/types";
import type { HaloService } from "../../services/halo/halo";
import type { LogService } from "../../services/log/types";

function splitGameTypeAndMap(gameTypeAndMap: string): { gameType: string; gameMap: string } {
  const colonSplit = gameTypeAndMap.split(":");
  if (colonSplit.length > 1) {
    const gameType = (colonSplit[0] ?? "").trim() || "*Unknown Game Type*";
    const gameMap = colonSplit.slice(1).join(":").trim() || "*Unknown Map*";
    return { gameType, gameMap };
  }

  const separator = " on ";
  const onIndex = gameTypeAndMap.indexOf(separator);
  if (onIndex > 0) {
    return {
      gameType: gameTypeAndMap.slice(0, onIndex).trim() || "*Unknown Game Type*",
      gameMap: gameTypeAndMap.slice(onIndex + separator.length).trim() || "*Unknown Map*",
    };
  }

  return { gameType: "*Unknown Game Type*", gameMap: gameTypeAndMap || "*Unknown Map*" };
}

async function getBestEffortMedalMetadata(
  haloService: HaloService,
  logService: LogService,
  matchesById: Record<string, MatchStats>,
): Promise<Record<string, { name: string; sortingWeight: number }>> {
  try {
    return await getMedalMetadataFromMatches(matchesById, async (medalId) => haloService.getMedal(medalId));
  } catch (error) {
    logService.warn(
      "Failed to resolve medal metadata for series matches, using empty metadata",
      new Map([["error", String(error)]]),
    );
    return {};
  }
}

export const seriesMatchesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/series-matches", async (request, env: Env) => {
    const services = installServices({ env });
    const { haloService, logService } = services;

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, seriesMatchesQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchIds } = queryParams.data;
    const uniqueMatchIds = [...new Set(matchIds)];

    const matches = await haloService.getMatchDetails(uniqueMatchIds);
    const matchesById: Record<string, MatchStats> = {};
    for (const match of matches) {
      matchesById[match.MatchId] = match;
    }

    const [playerXuidToGametagMap, medalMetadata] = await Promise.all([
      haloService.getPlayerXuidsToGametags(matches),
      getBestEffortMedalMetadata(haloService, logService, matchesById),
    ]);

    const responseMatches = await Promise.all(
      matches.map(async (match) => {
        const [gameTypeAndMap, mapThumbnailUrl] = await Promise.all([
          haloService.getGameTypeAndMap(match.MatchInfo),
          haloService.getMapThumbnailUrl(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
        ]);
        const { gameType, gameMap } = splitGameTypeAndMap(gameTypeAndMap);
        const { gameScore, gameSubScore } = haloService.getMatchScore(match, "en-US");

        return {
          matchId: match.MatchId,
          gameTypeAndMap,
          gameVariantCategory: match.MatchInfo.GameVariantCategory,
          gameType,
          gameMap,
          gameMapThumbnailUrl: mapThumbnailUrl ?? "data:,",
          duration: getReadableDuration(match.MatchInfo.Duration, "en-US"),
          gameScore,
          gameSubScore: gameSubScore ?? null,
          startTime: new Date(match.MatchInfo.StartTime).toISOString(),
          endTime: new Date(match.MatchInfo.EndTime).toISOString(),
          rawMatch: match,
        };
      }),
    );

    const playerXuidToGametag: Record<string, string> = {};
    for (const [xuid, gamertag] of playerXuidToGametagMap) {
      playerXuidToGametag[xuid] = gamertag;
    }

    return seriesMatchesContract.toResponse(
      { medalMetadata, playerXuidToGametag, matches: responseMatches },
      { noStore: true },
    );
  });
};
