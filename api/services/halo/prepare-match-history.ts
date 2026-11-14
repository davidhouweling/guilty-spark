import { AssetKind, MatchType } from "halo-infinite-api";
import type { HaloInfiniteClient, MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import type { CondensedMatchHistoryPage } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { LogService } from "../log/types";
import type { HaloService } from "./halo";
import { mapCondensedMatchHistoryPage } from "./match-history";
import type { MatchHistoryMappingInput } from "./match-history";

interface HistoryQuery {
  readonly start: number;
  readonly count: number;
  readonly category: "all" | "custom";
}

async function loadDetails(
  client: HaloInfiniteClient,
  matches: readonly PlayerMatchHistory[],
  logService: LogService,
): Promise<Map<string, MatchStats>> {
  const details = new Map<string, MatchStats>();
  for (let offset = 0; offset < matches.length; offset += 5) {
    await Promise.all(
      matches.slice(offset, offset + 5).map(async (match) => {
        try {
          const detail = await client.getMatchStats(match.MatchId);
          if (detail.MatchId !== match.MatchId) {
            throw new Error("Unexpected match identity");
          }
          details.set(match.MatchId, detail);
        } catch (error) {
          logService.warn(
            error,
            new Map([
              ["context", "Match history detail unavailable"],
              ["matchId", match.MatchId],
            ]),
          );
        }
      }),
    );
  }
  if (matches.length > 0 && details.size === 0) {
    throw new Error("All match history details unavailable");
  }
  return details;
}

async function loadGamertags(
  haloService: HaloService,
  details: ReadonlyMap<string, MatchStats>,
  logService: LogService,
): Promise<Map<string, string>> {
  const xuids = new Set<string>();
  for (const detail of details.values()) {
    for (const player of detail.Players) {
      if (player.PlayerType === 1) {
        xuids.add(getPlayerXuid(player));
      }
    }
  }
  const allXuids = [...xuids];
  const gamertags = new Map<string, string>();
  for (let offset = 0; offset < allXuids.length; offset += 24) {
    try {
      const users = await haloService.getUsersByXuids(allXuids.slice(offset, offset + 24));
      for (const user of users) {
        gamertags.set(user.xuid, user.gamertag);
      }
    } catch (error) {
      logService.warn(error, new Map([["context", "Match history gamertags unavailable"]]));
    }
  }
  return gamertags;
}

function createMetadataLoader(client: HaloInfiniteClient, logService: LogService) {
  const assets = new Map<string, ReturnType<HaloInfiniteClient["getSpecificAssetVersion"]>>();
  async function getAsset(
    kind: AssetKind.Map | AssetKind.UgcGameVariant | AssetKind.Playlist,
    assetId: string,
    versionId: string,
  ): ReturnType<HaloInfiniteClient["getSpecificAssetVersion"]> {
    const key = JSON.stringify([kind, assetId, versionId]);
    let asset = assets.get(key);
    if (asset == null) {
      asset = client.getSpecificAssetVersion(kind, assetId, versionId);
      assets.set(key, asset);
    }
    return asset;
  }
  return async (match: PlayerMatchHistory, detail: MatchStats | null): Promise<MatchHistoryMappingInput> => {
    const info = match.MatchInfo;
    const playlist = info.Playlist;
    const playlistName = async (): Promise<string | null> => {
      if (playlist == null) {
        return null;
      }
      try {
        return (await getAsset(AssetKind.Playlist, playlist.AssetId, playlist.VersionId)).PublicName.trim() || null;
      } catch (error) {
        logService.warn(error, new Map([["context", "Match history playlist unavailable"]]));
        return null;
      }
    };
    const [map, mode, matchmakingPlaylist] = await Promise.all([
      getAsset(AssetKind.Map, info.MapVariant.AssetId, info.MapVariant.VersionId),
      getAsset(AssetKind.UgcGameVariant, info.UgcGameVariant.AssetId, info.UgcGameVariant.VersionId),
      playlistName(),
    ]);
    const image =
      map.Files.FileRelativePaths.find((file) => file.includes("thumbnail")) ??
      map.Files.FileRelativePaths.find((file) => file.includes("hero"));
    return {
      match,
      detail,
      mapName: map.PublicName,
      modeName: mode.PublicName,
      mapThumbnailUrl: image == null ? "data:," : `${map.Files.Prefix}${image}`,
      matchmakingPlaylist,
    };
  };
}

export async function prepareMatchHistoryPage(
  client: HaloInfiniteClient,
  haloService: HaloService,
  logService: LogService,
  xuid: string,
  query: HistoryQuery,
): Promise<CondensedMatchHistoryPage> {
  if (
    !Number.isSafeInteger(query.start) ||
    query.start < 0 ||
    !Number.isInteger(query.count) ||
    query.count < 1 ||
    query.count > 25
  ) {
    throw new Error("Invalid match history page");
  }
  const matches = (
    await client.getPlayerMatches(
      xuid,
      query.category === "custom" ? MatchType.Custom : MatchType.All,
      query.count,
      query.start,
    )
  ).slice(0, query.count);
  const details = await loadDetails(client, matches, logService);
  const gamertags = await loadGamertags(haloService, details, logService);
  const loadMetadata = createMetadataLoader(client, logService);
  const inputs: MatchHistoryMappingInput[] = [];
  for (let offset = 0; offset < matches.length; offset += 5) {
    inputs.push(
      ...(await Promise.all(
        matches.slice(offset, offset + 5).map(async (match) => loadMetadata(match, details.get(match.MatchId) ?? null)),
      )),
    );
  }
  return mapCondensedMatchHistoryPage(inputs, xuid, gamertags);
}
