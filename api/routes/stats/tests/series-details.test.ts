import type { AutoRouterType } from "itty-router";
import { RequestError } from "halo-infinite-api";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeHaloInfiniteClient } from "../../../services/halo/fakes/infinite-client.fake";
import { aFakeSeriesDetailMatchWith } from "../../../services/halo/fakes/series-detail.fake";
import { getMedalsMetadata } from "../../../services/halo/fakes/data";
import { statsRoutesRegisterHandler } from "../stats";

function detailAt(series: SeriesDetailResponse, index: number): MatchDetail {
  const result = Preconditions.checkExists(series.matches.results[index]);
  if (result.status !== "resolved") {
    throw new Error("Expected resolved detail");
  }
  return result.detail;
}

describe("/api/stats/series-details/:seriesId", () => {
  let env: Env;
  let router: AutoRouterType;
  let services: Services;
  let ownerService: HaloService;
  let userClient: ReturnType<typeof aFakeHaloInfiniteClient>;
  let getMatchDetailsSpy: MockInstance<HaloService["getMatchDetails"]>;
  let getPlayerXuidsToGametagsSpy: MockInstance<HaloService["getPlayerXuidsToGametags"]>;
  let getMedalsMetadataSpy: MockInstance<HaloService["getMedalsMetadata"]>;
  let getMapNameSpy: MockInstance<HaloService["getMapName"]>;
  let getGameTypeSpy: MockInstance<HaloService["getGameType"]>;
  let getMapThumbnailUrlStrictSpy: MockInstance<HaloService["getMapThumbnailUrlStrict"]>;
  let ownerGetMatchDetailsSpy: MockInstance<HaloService["getMatchDetails"]>;
  let getIndividualTrackerSpy: MockInstance<Services["databaseService"]["getIndividualTracker"]>;
  let getClientForUserSpy: MockInstance<Services["userTokenProvider"]["getClientForUser"]>;
  let withUserClientSpy: MockInstance<HaloService["withUserClient"]>;
  let logErrorSpy: MockInstance<Services["logService"]["error"]>;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
    services = installFakeServicesWith({ env });
    ownerService = aFakeHaloServiceWith();
    userClient = aFakeHaloInfiniteClient();
    getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails").mockImplementation(async ([id]) => {
      const match = aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0");
      return Promise.resolve([{ ...match, MatchId: Preconditions.checkExists(id) }]);
    });
    ownerGetMatchDetailsSpy = vi.spyOn(ownerService, "getMatchDetails").mockResolvedValue([]);
    getIndividualTrackerSpy = vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
    getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(null);
    withUserClientSpy = vi.spyOn(services.haloService, "withUserClient").mockReturnValue(ownerService);
    logErrorSpy = vi.spyOn(services.logService, "error");
    getPlayerXuidsToGametagsSpy = vi
      .spyOn(services.haloService, "getPlayerXuidsToGametags")
      .mockResolvedValue(new Map());
    getMedalsMetadataSpy = vi.spyOn(services.haloService, "getMedalsMetadata").mockResolvedValue(getMedalsMetadata());
    getMapNameSpy = vi.spyOn(services.haloService, "getMapName").mockResolvedValue("Map");
    getGameTypeSpy = vi.spyOn(services.haloService, "getGameType").mockResolvedValue("Mode");
    getMapThumbnailUrlStrictSpy = vi
      .spyOn(services.haloService, "getMapThumbnailUrlStrict")
      .mockResolvedValue("https://example.com/map.png");
    statsRoutesRegisterHandler(
      router,
      vi.fn<typeof installFakeServicesWith>(() => services),
    );
  });

  async function request(query: string): Promise<Response> {
    return (await router.fetch(
      new Request(`http://localhost/api/stats/series-details/selected${query}`),
      env,
    )) as Response;
  }

  async function post(body: string, query = ""): Promise<Response> {
    return (await router.fetch(
      new Request(`http://localhost/api/stats/series-details/selected${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      env,
    )) as Response;
  }

  it("aggregates the entire series once across batches using the chronological anchor and distinct IDs", async () => {
    const matchIds = Array.from({ length: 31 }, (_, index) => `match-${String(30 - index)}`);
    matchIds.push("match-30");
    getMatchDetailsSpy.mockImplementation(async ([id]) => {
      const index = Number(Preconditions.checkExists(id).replace("match-", ""));
      const match = aFakeSeriesDetailMatchWith(index, index !== 0);
      if (index === 0) {
        match.MatchInfo.MapVariant.AssetId = "map-1";
      }
      return Promise.resolve([match]);
    });
    getPlayerXuidsToGametagsSpy
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([["0100000000000000", "Known Spartan"]]));
    const response = await post(JSON.stringify({ matchIds }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const series = await seriesDetailContract.fromResponse(response);
    expect(series.matches.matchIds).toEqual(matchIds);
    expect(series.matches.results[0]).toEqual(series.matches.results[31]);
    expect(getMatchDetailsSpy).toHaveBeenCalledTimes(31);
    expect(
      getPlayerXuidsToGametagsSpy.mock.calls.map(([matches]) => (Array.isArray(matches) ? matches.length : 1)),
    ).toEqual([30, 1]);
    expect(detailAt(series, 0).teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(series.aggregation).toMatchObject({
      status: "resolved",
      gamesPlayed: 31,
      completedGameCount: 30,
    });
    if (series.aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregate");
    }
    expect(series.aggregation.players.find((player) => player.playerId === "0100000000000000")).toMatchObject({
      gamertag: "Known Spartan",
      gamesPlayed: 31,
    });
  });

  it("preserves unavailable and duplicate results across batches and declines incomplete totals", async () => {
    const matchIds = Array.from({ length: 30 }, (_, index) => `match-${String(index)}`);
    matchIds.push("missing", "match-0", "missing");
    getMatchDetailsSpy.mockImplementation(async ([id]) => {
      if (id === "missing") {
        return Promise.resolve([]);
      }
      const index = Number(Preconditions.checkExists(id).replace("match-", ""));
      return Promise.resolve([aFakeSeriesDetailMatchWith(index, index !== 0)]);
    });
    const series = await seriesDetailContract.fromResponse(await post(JSON.stringify({ matchIds })));
    expect(series.matches.matchIds).toEqual(matchIds);
    expect(series.matches.results[30]).toEqual({ status: "unavailable", matchId: "missing", reason: "not-found" });
    expect(series.matches.results[31]).toEqual(series.matches.results[0]);
    expect(series.matches.results[32]).toEqual(series.matches.results[30]);
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(getMatchDetailsSpy).toHaveBeenCalledTimes(31);
  });

  it("maps substituted swapped rosters across a 30-match boundary over the whole series", async () => {
    const matchIds = Array.from({ length: 31 }, (_, index) => `match-${String(index)}`);
    matchIds.push("match-0");
    getMatchDetailsSpy.mockImplementation(async ([id]) => {
      const index = Number(Preconditions.checkExists(id).replace("match-", ""));
      return Promise.resolve([aFakeSeriesDetailMatchWith(index, index === 30, index === 30)]);
    });
    const series = await seriesDetailContract.fromResponse(
      await post(JSON.stringify({ matchIds, teamMappingMode: "substitution-aware" })),
    );
    expect(series.matches.matchIds).toEqual(matchIds);
    expect(series.matches.results[0]).toEqual(series.matches.results[31]);
    expect(getMatchDetailsSpy).toHaveBeenCalledTimes(31);
    expect(detailAt(series, 30).teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(series.aggregation).toMatchObject({ status: "resolved", gamesPlayed: 31, completedGameCount: 31 });
    if (series.aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregate");
    }
    expect(series.aggregation.players.find((player) => player.playerId === "0900000000000000")).toMatchObject({
      gamesPlayed: 1,
      teamStats: [{ seriesTeamId: 7, gamesPlayed: 1 }],
    });
  });

  it.each(["not json", "{}", '{"matchIds":[]}', '{"matchIds":[""]}', `{"matchIds":["${"a".repeat(129)}"]}`])(
    "rejects invalid POST bodies before credential or Halo lookup",
    async (body) => {
      const response = await post(body, "?trackerId=tracker");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid series details request" });
      expect(getMatchDetailsSpy).not.toHaveBeenCalled();
      expect(getIndividualTrackerSpy).not.toHaveBeenCalled();
    },
  );

  it("uses the existing tracker owner hint for POST without returning credentials", async () => {
    getIndividualTrackerSpy.mockResolvedValue(
      aFakeIndividualTrackersRow({ TrackerId: "tracker", UserId: "owner", IsLive: 1 }),
    );
    getClientForUserSpy.mockResolvedValue(userClient);
    const response = await post(
      '{"matchIds":["one"],"teamMappingMode":"substitution-aware"}',
      "?trackerId=%20tracker%20",
    );
    expect(getIndividualTrackerSpy).toHaveBeenCalledWith("tracker");
    expect(withUserClientSpy).toHaveBeenCalledWith(userClient);
    expect(ownerGetMatchDetailsSpy).toHaveBeenCalledWith(["one"]);
    expect(JSON.stringify(await seriesDetailContract.fromResponse(response))).not.toMatch(
      /accessToken|refreshToken|userClient/,
    );
  });

  it("returns an error when a later batch has an unexpected failure", async () => {
    getMatchDetailsSpy.mockImplementation(async ([id]) => {
      if (id === "match-30") {
        return Promise.reject(new Error("unexpected"));
      }
      const index = Number(Preconditions.checkExists(id).replace("match-", ""));
      return Promise.resolve([aFakeSeriesDetailMatchWith(index, index !== 0)]);
    });
    const response = await post(
      JSON.stringify({ matchIds: Array.from({ length: 31 }, (_, index) => `match-${String(index)}`) }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to resolve series details" });
  });

  it("preserves request order and per-game sides with chronological stable totals and no raw data", async () => {
    const response = await request("?matchIds=match-1,match-0,match-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const json = await response.clone().text();
    const series = await seriesDetailContract.fromResponse(response);
    expect(series.seriesId).toBe("selected");
    expect(series.matches.matchIds).toEqual(["match-1", "match-0", "match-1"]);
    expect(series.matches.results[0]).toEqual(series.matches.results[2]);
    expect(getMatchDetailsSpy.mock.calls).toEqual([[["match-1"]], [["match-0"]]]);
    const detail = detailAt(series, 0);
    expect(detail.teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(detail.players.map((player) => player.lastMatchTeamId)).toEqual([7, 7, 3, 3]);
    expect(detail.score.primary?.teams).toEqual([
      { matchTeamId: 7, seriesTeamId: 3, value: 50 },
      { matchTeamId: 3, seriesTeamId: 7, value: 40 },
    ]);
    expect(detail.players[0]?.teamStats[0]).toMatchObject({ matchTeamId: 7, seriesTeamId: 3 });
    expect(series.aggregation).toMatchObject({
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 2,
      teams: [
        { seriesTeamId: 3, gamesWon: 0 },
        { seriesTeamId: 7, gamesWon: 2 },
      ],
    });
    const { aggregation } = series;
    if (aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregate");
    }
    expect(aggregation.teams.map((team) => team.stats.find((stat) => stat.key === "Kills"))).toEqual([
      expect.objectContaining({ status: "available", value: 21 }),
      expect.objectContaining({ status: "available", value: 21 }),
    ]);
    const player = Preconditions.checkExists(
      aggregation.players.find((candidate) => candidate.playerId === "0100000000000000"),
    );
    expect(player.teamStats).toMatchObject([{ seriesTeamId: 7, gamesPlayed: 2 }]);
    expect(player.stats.find((stat) => stat.key === "Kills")).toMatchObject({
      status: "available",
      value: 3,
    });
    expect(json).not.toMatch(/rawMatch|seriesMatch|MatchInfo|CoreStats|PlayerTeamStats|accessToken|refreshToken/);
  });

  it("retains resolved identities and medal metadata in aggregate and per-game details", async () => {
    const metadata = getMedalsMetadata();
    const medal = Preconditions.checkExists(metadata.medals[0]);
    getPlayerXuidsToGametagsSpy.mockResolvedValue(new Map([["0100000000000000", "Known Spartan"]]));
    getMatchDetailsSpy.mockImplementation(async ([id]) => {
      const match = aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0");
      if (id === "match-0") {
        const player = Preconditions.checkExists(
          match.Players.find((candidate) => candidate.PlayerId === "0100000000000000"),
        );
        const teamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
        teamStats.Stats.CoreStats.Medals = [
          { NameId: medal.nameId, Count: 2, TotalPersonalScoreAwarded: medal.personalScore * 2 },
        ];
      }
      return Promise.resolve([match]);
    });

    const response = await request("?matchIds=match-0,match-1");
    const json = await response.clone().text();
    const series = await seriesDetailContract.fromResponse(response);
    expect(response.status).toBe(200);
    if (series.aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregate");
    }

    const medalDetails = {
      id: medal.nameId,
      name: medal.name.value,
      sortingWeight: medal.sortingWeight,
      difficultyIndex: medal.difficultyIndex,
      difficulty: metadata.difficulties[medal.difficultyIndex],
    };
    const aggregatePlayer = Preconditions.checkExists(
      series.aggregation.players.find((player) => player.playerId === "0100000000000000"),
    );
    expect(aggregatePlayer.gamertag).toBe("Known Spartan");
    expect(aggregatePlayer.medals[0]).toMatchObject(medalDetails);
    expect(Preconditions.checkExists(aggregatePlayer.medals[0]).count).toBeGreaterThan(0);

    const gamePlayer = Preconditions.checkExists(
      detailAt(series, 0).players.find((player) => player.playerId === "0100000000000000"),
    );
    expect(gamePlayer.gamertag).toBe("Known Spartan");
    expect(gamePlayer.teamStats[0]?.medals[0]).toMatchObject({ ...medalDetails, count: 2 });
    expect(json).not.toMatch(
      /rawMatches|rosterOptions|identitiesByPlayerId|medalMetadataById|medalDifficulties|MatchInfo|CoreStats|PlayerTeamStats/,
    );
    expect(getMedalsMetadataSpy).toHaveBeenCalledTimes(1);
    expect(getMapNameSpy).toHaveBeenCalledTimes(2);
    expect(getGameTypeSpy).toHaveBeenCalledTimes(1);
    expect(getMapThumbnailUrlStrictSpy).toHaveBeenCalledTimes(2);
  });

  it("retains partial matches but explicitly declines incomplete totals", async () => {
    getMatchDetailsSpy.mockImplementation(async ([id]) =>
      Promise.resolve(id === "match-0" ? [aFakeSeriesDetailMatchWith(0)] : []),
    );
    const response = await request("?matchIds=missing,match-0,missing");
    const series = await seriesDetailContract.fromResponse(response);
    expect(response.status).toBe(200);
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(series.matches.results).toEqual([
      { status: "unavailable", matchId: "missing", reason: "not-found" },
      expect.objectContaining({ status: "resolved", matchId: "match-0" }),
      { status: "unavailable", matchId: "missing", reason: "not-found" },
    ]);
  });

  it("returns explicit unavailable states for an entirely unavailable batch", async () => {
    const error = new RequestError(new URL("https://example.com"), new Response("", { status: 403 }));
    getMatchDetailsSpy.mockRejectedValue(error);
    const response = await request("?matchIds=one,two");
    const series = await seriesDetailContract.fromResponse(response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(series.matches.results).toEqual([
      { status: "unavailable", matchId: "one", reason: "forbidden" },
      { status: "unavailable", matchId: "two", reason: "forbidden" },
    ]);
    expect(logErrorSpy).toHaveBeenCalledWith(error, new Map([["matchId", "one"]]));
  });

  it.each(["", "&isManualSeries=true"])(
    "keeps substituted normal rosters ambiguous without a manual knob %s",
    async (extra) => {
      getMatchDetailsSpy.mockImplementation(async ([id]) =>
        Promise.resolve([aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, true, id !== "match-0")]),
      );
      const series = await seriesDetailContract.fromResponse(await request(`?matchIds=match-0,match-1${extra}`));
      expect(series.aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
      expect(detailAt(series, 1).teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
    },
  );

  it("applies the same explicit and default mapping modes for GET and POST", async () => {
    getMatchDetailsSpy.mockImplementation(async ([id]) =>
      Promise.resolve([aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0", id !== "match-0")]),
    );
    const matchIds = ["match-1", "match-0", "match-1"];
    const getDefault = await seriesDetailContract.fromResponse(await request("?matchIds=match-1,match-0,match-1"));
    const postDefault = await seriesDetailContract.fromResponse(await post(JSON.stringify({ matchIds })));
    expect(getDefault).toEqual(postDefault);
    expect(getDefault.aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
    const getExact = await seriesDetailContract.fromResponse(
      await request("?matchIds=match-1,match-0,match-1&teamMappingMode=exact-roster"),
    );
    const postExact = await seriesDetailContract.fromResponse(
      await post(JSON.stringify({ matchIds, teamMappingMode: "exact-roster" })),
    );
    expect(getExact).toEqual(getDefault);
    expect(postExact).toEqual(getDefault);
    const getExplicit = await seriesDetailContract.fromResponse(
      await request("?matchIds=match-1,match-0,match-1&teamMappingMode=substitution-aware"),
    );
    const postExplicit = await seriesDetailContract.fromResponse(
      await post(JSON.stringify({ matchIds, teamMappingMode: "substitution-aware" })),
    );
    expect(getExplicit).toEqual(postExplicit);
    expect(getExplicit.matches.results[0]).toEqual(getExplicit.matches.results[2]);
    expect(detailAt(getExplicit, 0).teams.map((team) => team.seriesTeamId)).toEqual([3, 7]);
    expect(getExplicit.aggregation).toMatchObject({ status: "resolved", gamesPlayed: 2 });
  });

  it("rejects invalid mapping modes before tracker lookup or match fetch", async () => {
    const getResponse = await request("?matchIds=one&trackerId=tracker&teamMappingMode=invalid");
    const postResponse = await post('{"matchIds":["one"],"teamMappingMode":"invalid"}', "?trackerId=tracker");
    expect(getResponse.status).toBe(400);
    expect(await getResponse.json()).toEqual({ error: "Invalid query parameters" });
    expect(postResponse.status).toBe(400);
    expect(await postResponse.json()).toEqual({ error: "Invalid series details request" });
    expect(getIndividualTrackerSpy).not.toHaveBeenCalled();
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?matchIds=",
    "?matchIds=one,,two&trackerId=tracker",
    `?matchIds=${"a".repeat(129)}`,
    `?matchIds=${Array.from({ length: 31 }, () => "one").join(",")}`,
  ])("rejects invalid bounded query %s before credential or Halo lookup", async (query) => {
    const response = await request(query);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Invalid query parameters" });
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    expect(getIndividualTrackerSpy).not.toHaveBeenCalled();
  });

  it("uses the existing live tracker owner service without returning credentials", async () => {
    getIndividualTrackerSpy.mockResolvedValue(
      aFakeIndividualTrackersRow({ TrackerId: "tracker", UserId: "owner", IsLive: 1 }),
    );
    getClientForUserSpy.mockResolvedValue(userClient);
    const response = await request("?matchIds=one&trackerId=%20tracker%20&teamMappingMode=substitution-aware");
    expect(response.status).toBe(200);
    expect(getIndividualTrackerSpy).toHaveBeenCalledWith("tracker");
    expect(getClientForUserSpy).toHaveBeenCalledWith("owner");
    expect(withUserClientSpy).toHaveBeenCalledWith(userClient);
    expect(ownerGetMatchDetailsSpy).toHaveBeenCalledWith(["one"]);
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    const series = await seriesDetailContract.fromResponse(response);
    expect(series.matches.results).toEqual([{ status: "unavailable", matchId: "one", reason: "not-found" }]);
    expect(JSON.stringify(series)).not.toMatch(/accessToken|refreshToken|userClient/);
  });

  it("skips owner lookup for a blank tracker", async () => {
    expect((await request("?matchIds=match-0&trackerId=%20%20")).status).toBe(200);
    expect(getIndividualTrackerSpy).not.toHaveBeenCalled();
    expect(getMatchDetailsSpy).toHaveBeenCalledWith(["match-0"]);
  });

  it.each(["missing", "inactive", "signed-out"])("uses bot credentials for a %s tracker owner", async (state) => {
    getIndividualTrackerSpy.mockResolvedValue(
      state === "missing"
        ? null
        : aFakeIndividualTrackersRow({ UserId: "owner", IsLive: state === "inactive" ? 0 : 1 }),
    );
    expect((await request("?matchIds=match-0&trackerId=tracker")).status).toBe(200);
    expect(getMatchDetailsSpy).toHaveBeenCalledWith(["match-0"]);
    expect(withUserClientSpy).not.toHaveBeenCalled();
    expect(getClientForUserSpy).toHaveBeenCalledTimes(state === "signed-out" ? 1 : 0);
  });

  it("logs owner resolution failure and falls back to the bot service", async () => {
    const error = new Error("database unavailable");
    getIndividualTrackerSpy.mockRejectedValue(error);
    expect((await request("?matchIds=match-0&trackerId=tracker")).status).toBe(200);
    expect(getMatchDetailsSpy).toHaveBeenCalledWith(["match-0"]);
    expect(logErrorSpy).toHaveBeenCalledWith(
      error,
      new Map([
        ["context", "Failed to resolve user credentials for series details tracker"],
        ["trackerId", "tracker"],
      ]),
    );
  });

  it("logs unexpected preparation errors and returns a no-store error", async () => {
    const error = new Error("unexpected");
    getMatchDetailsSpy.mockRejectedValue(error);
    const response = await request("?matchIds=one");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Failed to resolve series details" });
    expect(logErrorSpy).toHaveBeenCalledWith(error, new Map([["context", "Failed to resolve series details route"]]));
  });
});
