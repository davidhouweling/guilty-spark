import type { MatchStats } from "halo-infinite-api";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getMedalMetadataFromMatches } from "@guilty-spark/shared/halo/medals";
import { seriesMatchesContract, seriesMatchesQuerySchema } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { RoutesRegisterHandler } from "../base/types";
import type { HaloService } from "../../services/halo/halo";
import type { LogService } from "../../services/log/types";

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

    try {
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
      const orderedMatches = uniqueMatchIds
        .map((matchId) => matchesById[matchId])
        .filter((match): match is MatchStats => match != null);

      const [playerXuidToGametagMap, medalMetadata] = await Promise.all([
        haloService.getPlayerXuidsToGametags(orderedMatches),
        getBestEffortMedalMetadata(haloService, logService, matchesById),
      ]);

      const responseMatches = await Promise.all(
        orderedMatches.map(async (match) => {
          const [{ gameType, gameMap }, mapThumbnailUrl] = await Promise.all([
            haloService.getGameTypeAndMapParts(match.MatchInfo),
            haloService.getMapThumbnailUrl(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
          ]);
          const { gameScore, gameSubScore } = haloService.getMatchScore(match, "en-US");

          return {
            matchId: match.MatchId,
            gameTypeAndMap: `${gameType}: ${gameMap}`,
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
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve series matches route"]]));
      return errorContract.toResponse({ error: "Failed to resolve series matches" }, { status: 500, noStore: true });
    }
  });
};
