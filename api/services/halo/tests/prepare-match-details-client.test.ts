import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { AssetKind } from "halo-infinite-api";
import type { HaloInfiniteClient, MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import type { HaloService } from "../halo";
import { aFakeHaloServiceWith } from "../fakes/halo.fake";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake";
import { getAssetVersion } from "../fakes/data";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { prepareMatchDetails } from "../prepare-match-details";
import { TimeInSeconds } from "../types";

describe("prepareMatchDetails with the real HaloService", () => {
  let haloService: HaloService;
  let infiniteClient: HaloInfiniteClient;
  let logService: LogService;
  let getMatchStatsSpy: MockInstance<HaloInfiniteClient["getMatchStats"]>;
  let getUsersSpy: MockInstance<HaloInfiniteClient["getUsers"]>;
  let getSpecificAssetVersionSpy: MockInstance<HaloInfiniteClient["getSpecificAssetVersion"]>;
  let logWarnSpy: MockInstance<LogService["warn"]>;
  let matches: MatchStats[];

  beforeEach(() => {
    infiniteClient = aFakeHaloInfiniteClient();
    logService = aFakeLogServiceWith();
    haloService = aFakeHaloServiceWith({ infiniteClient, logService });
    matches = [aFakeMatchStatsWith({ MatchId: "first" }), aFakeMatchStatsWith({ MatchId: "second" })];
    getMatchStatsSpy = vi
      .spyOn(infiniteClient, "getMatchStats")
      .mockImplementation(async (matchId) =>
        Promise.resolve(Preconditions.checkExists(matches.find((match) => match.MatchId === matchId))),
      );
    getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
    getSpecificAssetVersionSpy = vi
      .spyOn(infiniteClient, "getSpecificAssetVersion")
      .mockImplementation(async (kind, assetId, versionId) => {
        await Promise.resolve();
        const asset = getAssetVersion();
        asset.AssetId = assetId;
        asset.VersionId = versionId;
        asset.PublicName = kind === AssetKind.Map ? "Aquarius - Ranked" : "Ranked: Slayer";
        asset.Files.Prefix = "https://example.com/";
        asset.Files.FileRelativePaths = ["thumbnail.png"];
        return asset;
      });
    logWarnSpy = vi.spyOn(logService, "warn");
  });

  it("normalizes an unresolved human name without changing the legacy sentinel", async () => {
    const match = Preconditions.checkExists(matches[0]);
    match.Players = [aFakePlayerWith({ PlayerId: "xuid(123)", PlayerType: 1 })];
    getUsersSpy.mockResolvedValue([]);
    const prepared = await prepareMatchDetails(haloService, ["first"], logService);
    expect(prepared.batch.results[0]).toMatchObject({
      status: "resolved",
      detail: { players: [{ gamertag: null }] },
    });
    expect(await haloService.getPlayerXuidsToGametags(match)).toEqual(new Map([["123", "*Unknown*"]]));
    expect(getUsersSpy).toHaveBeenCalledTimes(1);
    expect(getMatchStatsSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses in-flight map name and thumbnail requests across concurrent matches with distinct modes", async () => {
    const first = Preconditions.checkExists(matches[0]);
    const second = Preconditions.checkExists(matches[1]);
    second.MatchInfo.UgcGameVariant.AssetId = "different-mode";
    const prepared = await prepareMatchDetails(haloService, ["first", "second"], logService);
    expect(prepared.batch.results.map((result) => result.status)).toEqual(["resolved", "resolved"]);
    const mapCalls = getSpecificAssetVersionSpy.mock.calls.filter(([kind]) => kind === AssetKind.Map);
    expect(mapCalls).toEqual([
      [
        AssetKind.Map,
        first.MatchInfo.MapVariant.AssetId,
        first.MatchInfo.MapVariant.VersionId,
        {
          cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
        },
      ],
      [
        AssetKind.Map,
        first.MatchInfo.MapVariant.AssetId,
        first.MatchInfo.MapVariant.VersionId,
        { cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_WEEK"], 404: TimeInSeconds["1_DAY"], "500-599": 0 } } },
      ],
    ]);
    expect(getSpecificAssetVersionSpy.mock.calls.filter(([kind]) => kind === AssetKind.UgcGameVariant)).toHaveLength(2);
    expect(getSpecificAssetVersionSpy).toHaveBeenCalledTimes(4);
  });

  it("reuses an in-flight mode request across concurrent matches with distinct maps", async () => {
    const first = Preconditions.checkExists(matches[0]);
    Preconditions.checkExists(matches[1]).MatchInfo.MapVariant.AssetId = "different-map";
    await prepareMatchDetails(haloService, ["first", "second"], logService);
    expect(getSpecificAssetVersionSpy.mock.calls.filter(([kind]) => kind === AssetKind.UgcGameVariant)).toEqual([
      [
        AssetKind.UgcGameVariant,
        first.MatchInfo.UgcGameVariant.AssetId,
        first.MatchInfo.UgcGameVariant.VersionId,
        {
          cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
        },
      ],
    ]);
    expect(getSpecificAssetVersionSpy.mock.calls.filter(([kind]) => kind === AssetKind.Map)).toHaveLength(4);
    expect(getSpecificAssetVersionSpy).toHaveBeenCalledTimes(5);
  });

  it.each(["map", "mode", "thumbnail"])("propagates upstream %s enrichment errors", async (source) => {
    const error = new Error(`${source} lookup failed`);
    getSpecificAssetVersionSpy.mockImplementation(async (kind, _assetId, _versionId, options) => {
      const cache = options?.cf?.cacheTtlByStatus;
      const thumbnail =
        cache != null &&
        typeof cache === "object" &&
        "200-299" in cache &&
        cache["200-299"] === TimeInSeconds["1_WEEK"];
      if (
        (source === "map" && kind === AssetKind.Map && !thumbnail) ||
        (source === "mode" && kind === AssetKind.UgcGameVariant) ||
        (source === "thumbnail" && thumbnail)
      ) {
        throw error;
      }
      return Promise.resolve({ ...getAssetVersion(), PublicName: "Slayer" });
    });
    await expect(prepareMatchDetails(haloService, ["first"], logService)).rejects.toBe(error);
    expect(logWarnSpy).not.toHaveBeenCalled();
  });

  it("propagates thumbnail extraction errors instead of treating malformed assets as missing images", async () => {
    const error = new Error("Malformed thumbnail files");
    getSpecificAssetVersionSpy.mockImplementation(async (_kind, _assetId, _versionId, options) => {
      const asset = getAssetVersion();
      asset.PublicName = "Slayer";
      const cache = options?.cf?.cacheTtlByStatus;
      if (
        cache != null &&
        typeof cache === "object" &&
        "200-299" in cache &&
        cache["200-299"] === TimeInSeconds["1_WEEK"]
      ) {
        Object.defineProperty(asset, "Files", {
          get: () => {
            throw error;
          },
        });
      }
      return Promise.resolve(asset);
    });
    await expect(prepareMatchDetails(haloService, ["first"], logService)).rejects.toBe(error);
    expect(logWarnSpy).not.toHaveBeenCalled();
  });

  it("resolves valid assets without images to null and reuses existing name normalization", async () => {
    getSpecificAssetVersionSpy.mockImplementation(async (kind) => {
      const asset = getAssetVersion();
      asset.PublicName = kind === AssetKind.Map ? "Aquarius - Ranked" : "Ranked: Slayer";
      asset.Files.FileRelativePaths = [];
      return Promise.resolve(asset);
    });
    const prepared = await prepareMatchDetails(haloService, ["first"], logService);
    expect(prepared.batch.results[0]).toMatchObject({
      status: "resolved",
      detail: { map: { name: "Aquarius", thumbnailUrl: null }, mode: { name: "Slayer" } },
    });
    expect(logWarnSpy).not.toHaveBeenCalled();
  });

  it("preserves legacy map/mode fallbacks and thumbnail warning on upstream failures", async () => {
    const error = new Error("Asset lookup failed");
    getSpecificAssetVersionSpy.mockRejectedValue(error);
    const info = Preconditions.checkExists(matches[0]).MatchInfo;
    expect(await haloService.getGameTypeAndMapParts(info)).toEqual({
      gameMap: "*Unknown Map*",
      gameType: "*Unknown Game Type*",
    });
    expect(await haloService.getMapThumbnailUrl(info.MapVariant.AssetId, info.MapVariant.VersionId)).toBeNull();
    expect(logWarnSpy).toHaveBeenCalledExactlyOnceWith(
      error,
      new Map([
        [
          "context",
          `Failed to fetch map thumbnail for assetId ${info.MapVariant.AssetId}, versionId ${info.MapVariant.VersionId}`,
        ],
      ]),
    );
  });
});
