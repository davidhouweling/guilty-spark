import { RequestError } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { matchDetailBatchSchema } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetailResult } from "@guilty-spark/shared/contracts/stats/detail";
import type { Player } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { LogService } from "../log/types";
import type { HaloService } from "./halo";
import { mapMatchDetail } from "./match-detail";
import type { MatchDetailRosterOptions, PreparedMatchDetails } from "./types";

type UnavailableMatch = Extract<MatchDetailResult, { status: "unavailable" }>;

async function loadMatch(
  haloService: HaloService,
  matchId: string,
  logService: LogService,
): Promise<MatchStats | UnavailableMatch> {
  let matches: MatchStats[];
  try {
    matches = await haloService.getMatchDetails([matchId]);
  } catch (error) {
    if (!(error instanceof RequestError)) {
      throw error;
    }
    const { status } = error.response;
    if (status !== 404) {
      logService.error(error, new Map([["matchId", matchId]]));
    }
    return {
      status: "unavailable",
      matchId,
      reason: status === 404 ? "not-found" : status === 401 || status === 403 ? "forbidden" : "fetch-failed",
    };
  }
  const [match] = matches;
  if (matches.length > 1 || (match != null && match.MatchId !== matchId)) {
    throw new Error(`Unexpected raw match identity for ${matchId}`);
  }
  return match ?? { status: "unavailable", matchId, reason: "not-found" };
}

async function loadMatches(
  haloService: HaloService,
  matchIds: string[],
  logService: LogService,
): Promise<(MatchStats | UnavailableMatch)[]> {
  const loadedMatches: (MatchStats | UnavailableMatch)[] = [];
  for (const matchId of matchIds) {
    loadedMatches.push(await loadMatch(haloService, matchId, logService));
  }
  return loadedMatches;
}

async function loadRosterOptions(haloService: HaloService, matches: MatchStats[]): Promise<MatchDetailRosterOptions> {
  const gamertags = await haloService.getPlayerXuidsToGametags(matches, { propagateFailures: true });
  const metadata = await haloService.getMedalsMetadata();
  const identitiesByPlayerId = new Map<string, Pick<Player, "gamertag" | "discordUserId">>();
  for (const player of matches.flatMap((match) => match.Players)) {
    const gamertag = player.PlayerType === 1 ? gamertags.get(getPlayerXuid(player)) : undefined;
    identitiesByPlayerId.set(player.PlayerId, {
      gamertag: gamertag === "*Unknown*" ? null : (gamertag ?? null),
    });
  }
  return {
    identitiesByPlayerId,
    medalMetadataById: Object.fromEntries(metadata.medals.map((medal) => [medal.nameId, medal])),
    medalDifficulties: metadata.difficulties,
  };
}

async function mapDetails(
  haloService: HaloService,
  matches: MatchStats[],
  rosterOptions: MatchDetailRosterOptions,
): Promise<Map<string, MatchDetailResult>> {
  const mapNames = new Map<string, ReturnType<HaloService["getMapName"]>>();
  const modeNames = new Map<string, ReturnType<HaloService["getGameType"]>>();
  const thumbnails = new Map<string, ReturnType<HaloService["getMapThumbnailUrlStrict"]>>();
  const results = new Map<string, MatchDetailResult>();
  async function mapDetail(match: MatchStats): Promise<void> {
    const info = match.MatchInfo;
    const mapKey = JSON.stringify([info.MapVariant.AssetId, info.MapVariant.VersionId]);
    const modeKey = JSON.stringify([info.UgcGameVariant.AssetId, info.UgcGameVariant.VersionId]);
    if (!mapNames.has(mapKey)) {
      mapNames.set(mapKey, haloService.getMapName(info.MapVariant.AssetId, info.MapVariant.VersionId));
    }
    const gameMap = await Preconditions.checkExists(mapNames.get(mapKey));
    if (!modeNames.has(modeKey)) {
      modeNames.set(modeKey, haloService.getGameType(info.UgcGameVariant.AssetId, info.UgcGameVariant.VersionId));
    }
    const gameType = await Preconditions.checkExists(modeNames.get(modeKey));
    if (!thumbnails.has(mapKey)) {
      thumbnails.set(mapKey, haloService.getMapThumbnailUrlStrict(info.MapVariant.AssetId, info.MapVariant.VersionId));
    }
    const thumbnail = await Preconditions.checkExists(thumbnails.get(mapKey));
    results.set(match.MatchId, {
      status: "resolved",
      matchId: match.MatchId,
      detail: mapMatchDetail(match, {
        ...rosterOptions,
        mapName: gameMap,
        modeName: gameType,
        mapThumbnailUrl: thumbnail,
      }),
    });
  }
  for (const match of matches) {
    await mapDetail(match);
  }
  return results;
}

/**
 * Prepares bounded public results alongside backend-only raw matches.
 * Raw HTTP failures become unavailable results; enrichment failures propagate.
 * Upstream loads and enrichment run sequentially, awaiting each response before starting the next.
 * Map names, mode names and thumbnails reuse independent asset-version promises within this request.
 */
export async function prepareMatchDetails(
  haloService: HaloService,
  requestedIds: readonly string[],
  logService: LogService,
): Promise<PreparedMatchDetails> {
  const matchIds = matchDetailBatchSchema.shape.matchIds.parse(requestedIds);
  const loadedMatches = await loadMatches(haloService, [...new Set(matchIds)], logService);
  const rawMatches = loadedMatches.filter((match): match is MatchStats => !("status" in match));
  const rosterOptions = rawMatches.length === 0 ? {} : await loadRosterOptions(haloService, rawMatches);
  const resultsById =
    rawMatches.length === 0
      ? new Map<string, MatchDetailResult>()
      : await mapDetails(haloService, rawMatches, rosterOptions);
  for (const match of loadedMatches) {
    if ("status" in match) {
      resultsById.set(match.matchId, match);
    }
  }
  const results = matchIds.map(
    (matchId): MatchDetailResult => resultsById.get(matchId) ?? { status: "unavailable", matchId, reason: "not-found" },
  );
  return { batch: matchDetailBatchSchema.parse({ matchIds, results }), rawMatches, rosterOptions };
}
