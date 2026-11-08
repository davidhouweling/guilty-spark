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
    vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
    vi.spyOn(services.haloService, "getMedalsMetadata").mockResolvedValue(getMedalsMetadata());
    vi.spyOn(services.haloService, "getGameTypeAndMapParts").mockResolvedValue({ gameMap: "Map", gameType: "Mode" });
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("https://example.com/map.png");
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
    const response = await request("?matchIds=one&trackerId=%20tracker%20");
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
