import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { MATCH_DETAIL_BATCH_LIMIT } from "@guilty-spark/shared/contracts/stats/detail";
import type {
  MatchDetailResult,
  SeriesDetailResponse,
  SeriesTeamMappingMode,
} from "@guilty-spark/shared/contracts/stats/detail";
import type { Player } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import type { LogService } from "../log/types";
import type { HaloService } from "./halo";
import { prepareMatchDetails } from "./prepare-match-details";
import { mapSeriesDetail } from "./series-detail";
import type { MatchDetailRosterOptions } from "./types";

export async function prepareSeriesDetails(
  haloService: HaloService,
  seriesId: string,
  matchIds: string[],
  logService: LogService,
  teamMappingMode?: SeriesTeamMappingMode,
): Promise<SeriesDetailResponse> {
  const uniqueIds = [...new Set(matchIds)];
  const rawMatches: MatchStats[] = [];
  const resultsById = new Map<string, MatchDetailResult>();
  const identitiesByPlayerId = new Map<string, Pick<Player, "gamertag" | "discordUserId">>();
  let rosterOptions: MatchDetailRosterOptions = {};
  for (let offset = 0; offset < uniqueIds.length; offset += MATCH_DETAIL_BATCH_LIMIT) {
    const prepared = await prepareMatchDetails(
      haloService,
      uniqueIds.slice(offset, offset + MATCH_DETAIL_BATCH_LIMIT),
      logService,
    );
    rawMatches.push(...prepared.rawMatches);
    for (const result of prepared.batch.results) {
      resultsById.set(result.matchId, result);
    }
    for (const [playerId, identity] of prepared.rosterOptions.identitiesByPlayerId ?? []) {
      const previous = identitiesByPlayerId.get(playerId);
      identitiesByPlayerId.set(playerId, {
        gamertag: identity.gamertag ?? previous?.gamertag ?? null,
        discordUserId: identity.discordUserId ?? previous?.discordUserId,
      });
    }
    if (prepared.rawMatches.length > 0) {
      ({ rosterOptions } = prepared);
    }
  }
  const results = matchIds.map((matchId) => Preconditions.checkExists(resultsById.get(matchId)));
  return mapSeriesDetail(seriesId, matchIds, results, rawMatches, {
    ...rosterOptions,
    identitiesByPlayerId,
    teamMappingMode,
  });
}
