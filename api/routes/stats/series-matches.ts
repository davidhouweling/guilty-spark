import type { MatchStats } from "halo-infinite-api";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { seriesMatchesContract, seriesMatchesQuerySchema } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { RoutesRegisterHandler } from "../base/types";

export const seriesMatchesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/series-matches", async (request, env: Env) => {
    const services = installServices({ env });
    const { haloService, logService, databaseService, userTokenProvider } = services;

    try {
      const url = new URL(request.url);
      const queryParams = parseQueryParams(url, seriesMatchesQuerySchema, "Invalid query parameters");
      if (!queryParams.success) {
        return queryParams.response;
      }

      const { matchIds } = queryParams.data;
      const uniqueMatchIds = [...new Set(matchIds)];
      const trackerId = url.searchParams.get("trackerId") ?? undefined;

      let resolvedHaloService = haloService;
      if (trackerId != null) {
        try {
          const tracker = await databaseService.getIndividualTracker(trackerId);
          if (tracker != null) {
            const userClient = await userTokenProvider.getClientForUser(tracker.UserId);
            if (userClient != null) {
              resolvedHaloService = haloService.withUserClient(userClient);
            }
          }
        } catch {
          logService.debug("Failed to resolve user credentials for tracker", new Map([["trackerId", trackerId]]));
        }
      }

      const matches = await resolvedHaloService.getMatchDetails(uniqueMatchIds);
      const matchesById: Record<string, MatchStats> = {};
      for (const match of matches) {
        matchesById[match.MatchId] = match;
      }
      const orderedMatches = uniqueMatchIds
        .map((matchId) => matchesById[matchId])
        .filter((match): match is MatchStats => match != null);

      const playerXuidToGametagMap = await resolvedHaloService.getPlayerXuidsToGametags(orderedMatches);

      const responseMatches = await Promise.all(
        orderedMatches.map(async (match) => {
          const [{ gameType, gameMap }, mapThumbnailUrl] = await Promise.all([
            resolvedHaloService.getGameTypeAndMapParts(match.MatchInfo),
            resolvedHaloService.getMapThumbnailUrl(
              match.MatchInfo.MapVariant.AssetId,
              match.MatchInfo.MapVariant.VersionId,
            ),
          ]);
          const { gameScore, gameSubScore } = resolvedHaloService.getMatchScore(match, "en-US");

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

      return seriesMatchesContract.toResponse({ playerXuidToGametag, matches: responseMatches }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve series matches route"]]));
      return errorContract.toResponse({ error: "Failed to resolve series matches" }, { status: 500, noStore: true });
    }
  });
};
