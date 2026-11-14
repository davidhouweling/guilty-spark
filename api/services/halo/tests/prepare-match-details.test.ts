import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { AssetKind, RequestError } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeCoreStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/halo/fakes/data";
import type { HaloService } from "../halo";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeHaloServiceWith } from "../fakes/halo.fake";
import { getAssetVersion, getMedalsMetadata } from "../fakes/data";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake";
import { prepareMatchDetails } from "../prepare-match-details";
import { mapSeriesDetail } from "../series-detail";

describe("prepareMatchDetails", () => {
  let haloService: HaloService;
  let logService: LogService;
  let logErrorSpy: MockInstance<LogService["error"]>;
  let getMatchDetailsSpy: MockInstance<HaloService["getMatchDetails"]>;
  let getPlayerXuidsToGametagsSpy: MockInstance<HaloService["getPlayerXuidsToGametags"]>;
  let getMedalsMetadataSpy: MockInstance<HaloService["getMedalsMetadata"]>;
  let getMapNameSpy: MockInstance<HaloService["getMapName"]>;
  let getGameTypeSpy: MockInstance<HaloService["getGameType"]>;
  let getMapThumbnailUrlSpy: MockInstance<HaloService["getMapThumbnailUrlStrict"]>;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    logService = aFakeLogServiceWith();
    logErrorSpy = vi.spyOn(logService, "error");
    getMatchDetailsSpy = vi
      .spyOn(haloService, "getMatchDetails")
      .mockImplementation(async ([matchId]) =>
        Promise.resolve([aFakeMatchStatsWith({ MatchId: Preconditions.checkExists(matchId) })]),
      );
    getPlayerXuidsToGametagsSpy = vi.spyOn(haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
    getMedalsMetadataSpy = vi.spyOn(haloService, "getMedalsMetadata").mockResolvedValue(getMedalsMetadata());
    getMapNameSpy = vi.spyOn(haloService, "getMapName").mockResolvedValue("Aquarius");
    getGameTypeSpy = vi.spyOn(haloService, "getGameType").mockResolvedValue("Slayer");
    getMapThumbnailUrlSpy = vi
      .spyOn(haloService, "getMapThumbnailUrlStrict")
      .mockResolvedValue("https://example.com/map.png");
  });

  it("deduplicates upstream loads and metadata while preserving requested order and duplicates", async () => {
    const prepared = await prepareMatchDetails(haloService, ["second", "first", "second"], logService);
    expect(prepared.batch.matchIds).toEqual(["second", "first", "second"]);
    expect(prepared.batch.results.map((result) => [result.matchId, result.status])).toEqual([
      ["second", "resolved"],
      ["first", "resolved"],
      ["second", "resolved"],
    ]);
    expect(getMatchDetailsSpy.mock.calls).toEqual([[["second"]], [["first"]]]);
    expect(prepared.rawMatches.map((match) => match.MatchId)).toEqual(["second", "first"]);
    expect(getPlayerXuidsToGametagsSpy).toHaveBeenCalledExactlyOnceWith(prepared.rawMatches, {
      propagateFailures: true,
    });
    expect(getMedalsMetadataSpy).toHaveBeenCalledTimes(1);
    expect(getMapNameSpy).toHaveBeenCalledTimes(1);
    expect(getGameTypeSpy).toHaveBeenCalledTimes(1);
    expect(getMapThumbnailUrlSpy).toHaveBeenCalledTimes(1);
    expect(prepared.batch.results[0]).toEqual(prepared.batch.results[2]);
  });

  it("maps human identities and medals without exposing raw fields in the public contract", async () => {
    const medal = Preconditions.checkExists(getMedalsMetadata().medals[0]);
    const raw = aFakeMatchStatsWith({
      MatchId: "match",
      Teams: [
        aFakeTeamWith({
          TeamId: 7,
          Stats: {
            CoreStats: aFakeCoreStatsWith({
              Medals: [{ NameId: medal.nameId, Count: 2, TotalPersonalScoreAwarded: 0 }],
            }),
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(123)",
          LastTeamId: 7,
          PlayerTeamStats: [{ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith() } }],
        }),
        aFakePlayerWith({
          PlayerId: "bot(456)",
          PlayerType: 2,
          LastTeamId: 7,
          PlayerTeamStats: [{ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith() } }],
        }),
      ],
    });
    getMatchDetailsSpy.mockResolvedValue([raw]);
    getPlayerXuidsToGametagsSpy.mockResolvedValue(
      new Map([
        ["123", "Spartan"],
        ["456", "Not a human"],
      ]),
    );
    const prepared = await prepareMatchDetails(haloService, ["match"], logService);
    const result = Preconditions.checkExists(prepared.batch.results[0]);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved detail");
    }
    expect(result.detail.players.map((player) => player.gamertag)).toEqual(["Spartan", null]);
    expect(result.detail.teams[0]?.medals[0]?.name).toBe(medal.name.value);
    expect(result.detail.map.name).toBe("Aquarius");
    expect(result.detail.mode.name).toBe("Slayer");
    expect(result.detail.map.thumbnailUrl).toBe("https://example.com/map.png");
    expect(result.detail.teams[0]?.seriesTeamId).toBeNull();
    expect(prepared.rawMatches).toEqual([raw]);
    expect(prepared.rosterOptions.identitiesByPlayerId?.get("xuid(123)")).toEqual({ gamertag: "Spartan" });
    expect(prepared.rosterOptions.medalMetadataById?.[medal.nameId]).toEqual(medal);
    expect(prepared.rosterOptions.medalDifficulties).toEqual(getMedalsMetadata().difficulties);
    const response = await matchDetailContract.toResponse(prepared.batch).json();
    expect(response).toEqual(prepared.batch);
    expect(JSON.stringify(response)).not.toMatch(/rawMatches|MatchInfo|CoreStats|PlayerTeamStats/);
  });

  it("returns explicit not-found for upstream 404 and missing results without dropping duplicates", async () => {
    getMatchDetailsSpy.mockImplementation(async ([matchId]) => {
      if (matchId === "missing") {
        throw new RequestError(new URL("https://example.com"), new Response("", { status: 404 }));
      }
      return Promise.resolve(matchId === "empty" ? [] : [aFakeMatchStatsWith({ MatchId: "found" })]);
    });
    const prepared = await prepareMatchDetails(haloService, ["missing", "found", "empty", "missing"], logService);
    expect(prepared.batch.results).toEqual([
      { status: "unavailable", matchId: "missing", reason: "not-found" },
      expect.objectContaining({ status: "resolved", matchId: "found" }),
      { status: "unavailable", matchId: "empty", reason: "not-found" },
      { status: "unavailable", matchId: "missing", reason: "not-found" },
    ]);
    expect(prepared.rawMatches.map((match) => match.MatchId)).toEqual(["found"]);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it("skips enrichment when every match is missing", async () => {
    getMatchDetailsSpy.mockResolvedValue([]);
    const prepared = await prepareMatchDetails(haloService, ["missing"], logService);
    expect(prepared.rawMatches).toEqual([]);
    expect(prepared.rosterOptions).toEqual({});
    expect(getPlayerXuidsToGametagsSpy).not.toHaveBeenCalled();
    expect(getMedalsMetadataSpy).not.toHaveBeenCalled();
    expect(getMapNameSpy).not.toHaveBeenCalled();
    expect(getGameTypeSpy).not.toHaveBeenCalled();
    expect(getMapThumbnailUrlSpy).not.toHaveBeenCalled();
  });

  it("supplies exactly the backend raw matches needed for incomplete series composition", async () => {
    getMatchDetailsSpy.mockImplementation(async ([matchId]) =>
      Promise.resolve(matchId === "missing" ? [] : [aFakeMatchStatsWith({ MatchId: "found" })]),
    );
    const { batch, rawMatches } = await prepareMatchDetails(haloService, ["found", "missing", "found"], logService);
    const series = mapSeriesDetail("series", batch.matchIds, batch.results, rawMatches);
    expect(series.matches.matchIds).toEqual(batch.matchIds);
    expect(series.matches.results.map((result) => result.status)).toEqual(["resolved", "unavailable", "resolved"]);
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(series).not.toHaveProperty("rawMatches");
  });

  it("loads raw matches and metadata sequentially across the maximum 30 IDs", async () => {
    let activeLoads = 0;
    let maximumLoads = 0;
    let activeNames = 0;
    let maximumNames = 0;
    getMatchDetailsSpy.mockImplementation(async ([matchId]) => {
      activeLoads += 1;
      maximumLoads = Math.max(maximumLoads, activeLoads);
      await Promise.resolve();
      activeLoads -= 1;
      const raw = aFakeMatchStatsWith({ MatchId: Preconditions.checkExists(matchId) });
      raw.MatchInfo.MapVariant.AssetId = raw.MatchId;
      return [raw];
    });
    getMapNameSpy.mockImplementation(async () => {
      activeNames += 1;
      maximumNames = Math.max(maximumNames, activeNames);
      await Promise.resolve();
      activeNames -= 1;
      return "Aquarius";
    });
    const prepared = await prepareMatchDetails(
      haloService,
      Array.from({ length: 30 }, (_, index) => String(index)),
      logService,
    );
    expect(prepared.batch.results).toHaveLength(30);
    expect(maximumLoads).toBe(1);
    expect(maximumNames).toBe(1);
    expect(getMedalsMetadataSpy).toHaveBeenCalledTimes(1);
  });

  it("awaits each raw and enrichment response before starting the next with versioned metadata reuse", async () => {
    const calls: string[] = [];
    const releases: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    async function respond<T>(label: string, value: T): Promise<T> {
      calls.push(label);
      active += 1;
      maximum = Math.max(maximum, active);
      const deferred = Promise.withResolvers<undefined>();
      releases.push(() => {
        deferred.resolve(undefined);
      });
      await deferred.promise;
      active -= 1;
      return value;
    }
    const matches = ["first", "second", "last"].map((MatchId) => aFakeMatchStatsWith({ MatchId }));
    Preconditions.checkExists(matches[2]).MatchInfo.MapVariant.VersionId = "new-map";
    const client = aFakeHaloInfiniteClient();
    haloService = aFakeHaloServiceWith({ infiniteClient: client });
    vi.spyOn(client, "getMatchStats").mockImplementation(async (id) =>
      respond(`detail:${id}`, Preconditions.checkExists(matches.find((match) => match.MatchId === id))),
    );
    vi.spyOn(haloService, "getUsersByXuids").mockImplementation(async () => respond("names", []));
    vi.spyOn(client, "getMedalsMetadataFile").mockImplementation(async () => respond("medals", getMedalsMetadata()));
    vi.spyOn(client, "getSpecificAssetVersion").mockImplementation(async (kind, _id, version) => {
      const asset = getAssetVersion();
      asset.PublicName = kind === AssetKind.Map ? "Aquarius" : "Slayer";
      return respond(`asset:${String(kind)}:${version}`, asset);
    });
    const mapName = vi.spyOn(haloService, "getMapName");
    const modeName = vi.spyOn(haloService, "getGameType");
    const thumbnail = vi.spyOn(haloService, "getMapThumbnailUrlStrict");
    const first = Preconditions.checkExists(matches[0]);
    const mapRequest = `asset:${String(AssetKind.Map)}:${first.MatchInfo.MapVariant.VersionId}`;
    const newMapRequest = `asset:${String(AssetKind.Map)}:new-map`;
    const expected = [
      "detail:first",
      "detail:second",
      "detail:last",
      "names",
      "medals",
      mapRequest,
      `asset:${String(AssetKind.UgcGameVariant)}:${first.MatchInfo.UgcGameVariant.VersionId}`,
      mapRequest,
      newMapRequest,
      newMapRequest,
    ];
    const preparedPromise = prepareMatchDetails(haloService, ["first", "second", "last", "first"], logService);
    const checkpoints: { calls: string[]; active: number }[] = [];
    for (let index = 0; index < expected.length; index += 1) {
      await vi.waitFor(() => {
        if (calls.length <= index) {
          throw new Error("Waiting for next request");
        }
      });
      checkpoints.push({ calls: [...calls], active });
      Preconditions.checkExists(releases[index])();
    }
    const prepared = await preparedPromise;
    expect(checkpoints).toEqual(expected.map((_, index) => ({ calls: expected.slice(0, index + 1), active: 1 })));
    expect(maximum).toBe(1);
    expect(active).toBe(0);
    expect(calls).toEqual(expected);
    expect(prepared.batch.results.map((result) => [result.matchId, result.status])).toEqual([
      ["first", "resolved"],
      ["second", "resolved"],
      ["last", "resolved"],
      ["first", "resolved"],
    ]);
    expect(prepared.rawMatches).toEqual(matches);
    expect(mapName).toHaveBeenCalledTimes(2);
    expect(modeName).toHaveBeenCalledOnce();
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });

  it.each([{ ids: [] }, { ids: Array.from({ length: 31 }, () => "match") }, { ids: [""] }, { ids: ["x".repeat(129)] }])(
    "rejects invalid requested IDs before fetching: $ids",
    async ({ ids }) => {
      await expect(prepareMatchDetails(haloService, ids, logService)).rejects.toThrow();
      expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 401, reason: "forbidden" },
    { status: 403, reason: "forbidden" },
    { status: 429, reason: "fetch-failed" },
    { status: 500, reason: "fetch-failed" },
  ])("returns and logs explicit $reason for upstream $status", async ({ status, reason }) => {
    const error = new RequestError(new URL("https://example.com"), new Response("", { status }));
    getMatchDetailsSpy.mockRejectedValue(error);
    const prepared = await prepareMatchDetails(haloService, ["match", "match"], logService);
    expect(prepared.batch.results).toEqual(
      Array.from({ length: 2 }, () => ({ status: "unavailable", matchId: "match", reason })),
    );
    expect(prepared.rawMatches).toEqual([]);
    expect(getMatchDetailsSpy).toHaveBeenCalledTimes(1);
    expect(logErrorSpy).toHaveBeenCalledExactlyOnceWith(error, new Map([["matchId", "match"]]));
    expect(getMedalsMetadataSpy).not.toHaveBeenCalled();
  });

  it("preserves mixed resolved and failed results in requested order including duplicate failures", async () => {
    const forbidden = new RequestError(new URL("https://example.com"), new Response("", { status: 403 }));
    const failed = new RequestError(new URL("https://example.com"), new Response("", { status: 500 }));
    getMatchDetailsSpy.mockImplementation(async ([matchId]) => {
      if (matchId === "forbidden") {
        throw forbidden;
      }
      if (matchId === "failed") {
        throw failed;
      }
      return Promise.resolve([aFakeMatchStatsWith({ MatchId: "found" })]);
    });
    const prepared = await prepareMatchDetails(haloService, ["failed", "found", "forbidden", "failed"], logService);
    expect(prepared.batch.matchIds).toEqual(["failed", "found", "forbidden", "failed"]);
    expect(prepared.batch.results).toEqual([
      { status: "unavailable", matchId: "failed", reason: "fetch-failed" },
      expect.objectContaining({ status: "resolved", matchId: "found" }),
      { status: "unavailable", matchId: "forbidden", reason: "forbidden" },
      { status: "unavailable", matchId: "failed", reason: "fetch-failed" },
    ]);
    expect(prepared.rawMatches.map((match) => match.MatchId)).toEqual(["found"]);
    expect(getMatchDetailsSpy).toHaveBeenCalledTimes(3);
    expect(logErrorSpy.mock.calls).toEqual([
      [failed, new Map([["matchId", "failed"]])],
      [forbidden, new Map([["matchId", "forbidden"]])],
    ]);
  });

  it("propagates unexpected upstream errors without logging a handled failure", async () => {
    const error = new Error("Unexpected upstream failure");
    getMatchDetailsSpy.mockRejectedValue(error);
    await expect(prepareMatchDetails(haloService, ["match"], logService)).rejects.toBe(error);
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it("propagates malformed raw identity and mapping failures", async () => {
    getMatchDetailsSpy.mockResolvedValue([aFakeMatchStatsWith({ MatchId: "other" })]);
    await expect(prepareMatchDetails(haloService, ["match"], logService)).rejects.toThrow(
      "Unexpected raw match identity",
    );
    const raw = aFakeMatchStatsWith({ MatchId: "match" });
    raw.MatchInfo.Duration = "invalid";
    getMatchDetailsSpy.mockResolvedValue([raw]);
    await expect(prepareMatchDetails(haloService, ["match"], logService)).rejects.toThrow();
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it.each(["identities", "medals", "map", "mode", "thumbnail"])("propagates %s enrichment failures", async (source) => {
    const error = new Error(`${source} failed`);
    if (source === "identities") {
      getPlayerXuidsToGametagsSpy.mockRejectedValue(error);
    } else if (source === "medals") {
      getMedalsMetadataSpy.mockRejectedValue(error);
    } else if (source === "map") {
      getMapNameSpy.mockRejectedValue(error);
    } else if (source === "mode") {
      getGameTypeSpy.mockRejectedValue(error);
    } else {
      getMapThumbnailUrlSpy.mockRejectedValue(error);
    }
    await expect(prepareMatchDetails(haloService, ["match"], logService)).rejects.toBe(error);
  });

  it("keys map and mode metadata by asset versions and reuses thumbnails across modes", async () => {
    const matches = ["first", "second", "third"].map((MatchId) => aFakeMatchStatsWith({ MatchId }));
    Preconditions.checkExists(matches[1]).MatchInfo.UgcGameVariant.VersionId = "new-mode-version";
    Preconditions.checkExists(matches[2]).MatchInfo.MapVariant.VersionId = "new-map-version";
    getMatchDetailsSpy.mockImplementation(async ([matchId]) =>
      Promise.resolve(matches.filter((match: MatchStats) => match.MatchId === matchId)),
    );
    await prepareMatchDetails(haloService, ["first", "second", "third"], logService);
    expect(getMapNameSpy).toHaveBeenCalledTimes(2);
    expect(getGameTypeSpy).toHaveBeenCalledTimes(2);
    expect(getMapThumbnailUrlSpy).toHaveBeenCalledTimes(2);
  });
});
