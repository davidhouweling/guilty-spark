import type { AutoRouterType } from "itty-router";
import { RequestError } from "halo-infinite-api";
import { EmbedType } from "discord-api-types/v10";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { discordSeriesStatsContract } from "@guilty-spark/shared/contracts/stats/discord-series";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDiscordSeriesStatsResolvedWith } from "../../../services/discord/fakes/discord-series-stats.fake";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import { EmbedColors } from "../../../embeds/colors";
import {
  getDiscordSeriesStatsCacheKey,
  getDiscordSeriesStatsMatchIdsKey,
} from "../../../services/discord/discord-series-stats";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import { getMedalsMetadata } from "../../../services/halo/fakes/data";
import { aFakeSeriesDetailMatchWith } from "../../../services/halo/fakes/series-detail.fake";
import { statsRoutesRegisterHandler } from "../stats";

const GUILD_ID = "123456789012345678";
const QUEUE_NUMBER = 7777;
const MATCH_IDS = ["match-0", "match-1"];

function detailAt(series: SeriesDetailResponse, index: number): MatchDetail {
  const result = Preconditions.checkExists(series.matches.results[index]);
  if (result.status !== "resolved") {
    throw new Error("Expected resolved detail");
  }
  return result.detail;
}

describe("/api/stats/discord/:guildId/:queueNumber/detail", () => {
  let env: Env;
  let router: AutoRouterType;
  let services: Services;
  let appDataGetSpy: MockInstance<(...args: Parameters<Env["APP_DATA"]["get"]>) => Promise<unknown>>;
  let getSeriesStatsLookupSpy: MockInstance<Services["discordService"]["getSeriesStatsLookup"]>;
  let getSeriesStatsSpy: MockInstance<Services["discordService"]["getSeriesStats"]>;
  let getMatchDetailsSpy: MockInstance<Services["haloService"]["getMatchDetails"]>;
  let getPlayerXuidsToGametagsSpy: MockInstance<Services["haloService"]["getPlayerXuidsToGametags"]>;
  let logErrorSpy: MockInstance<Services["logService"]["error"]>;
  let getClientForUserSpy: MockInstance<Services["userTokenProvider"]["getClientForUser"]>;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
    services = installFakeServicesWith({ env });
    appDataGetSpy = vi.spyOn(env.APP_DATA, "get");
    appDataGetSpy.mockResolvedValue(null);
    getSeriesStatsLookupSpy = vi.spyOn(services.discordService, "getSeriesStatsLookup");
    getSeriesStatsSpy = vi.spyOn(services.discordService, "getSeriesStats");
    getMatchDetailsSpy = vi
      .spyOn(services.haloService, "getMatchDetails")
      .mockImplementation(async ([id]) =>
        Promise.resolve([aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0")]),
      );
    getPlayerXuidsToGametagsSpy = vi
      .spyOn(services.haloService, "getPlayerXuidsToGametags")
      .mockResolvedValue(new Map());
    vi.spyOn(services.haloService, "getMedalsMetadata").mockResolvedValue(getMedalsMetadata());
    vi.spyOn(services.haloService, "getMapName").mockResolvedValue("Map");
    vi.spyOn(services.haloService, "getGameType").mockResolvedValue("Slayer");
    vi.spyOn(services.haloService, "getMapThumbnailUrlStrict").mockResolvedValue("https://example.com/map.png");
    logErrorSpy = vi.spyOn(services.logService, "error");
    getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
    statsRoutesRegisterHandler(
      router,
      vi.fn<typeof installFakeServicesWith>(() => services),
    );
  });

  async function request(path = `${GUILD_ID}/${QUEUE_NUMBER.toString()}`, query = ""): Promise<Response> {
    return (await router.fetch(
      new Request(`http://localhost/api/stats/discord/${path}/detail${query}`),
      env,
    )) as Response;
  }

  it("maps a fresh normal lookup with stable side-swap identities and numerical totals", async () => {
    getPlayerXuidsToGametagsSpy.mockResolvedValue(new Map([["0100000000000000", "Spartan"]]));
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: MATCH_IDS,
    });
    const response = await request(undefined, "?isManualSeries=true&matchIds=other&trackerId=owner");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.clone().text();
    const series = await seriesDetailContract.fromResponse(response);
    expect(series.seriesId).toBe(`${GUILD_ID}:${QUEUE_NUMBER.toString()}`);
    expect(series.matches.matchIds).toEqual(MATCH_IDS);
    expect(detailAt(series, 1).teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(detailAt(series, 1).players.map((player) => player.lastMatchTeamId)).toEqual([7, 7, 3, 3]);
    expect(series.aggregation).toMatchObject({ status: "resolved", gamesPlayed: 2 });
    if (series.aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregation");
    }
    expect(series.aggregation.players.find((player) => player.playerId === "0100000000000000")?.gamertag).toBe(
      "Spartan",
    );
    expect(detailAt(series, 0).players[0]?.gamertag).toBe("Spartan");
    expect(getMatchDetailsSpy.mock.calls).toEqual([[["match-0"]], [["match-1"]]]);
    expect(getSeriesStatsLookupSpy).toHaveBeenCalledExactlyOnceWith(GUILD_ID, QUEUE_NUMBER);
    expect(getSeriesStatsSpy).not.toHaveBeenCalled();
    expect(getClientForUserSpy).not.toHaveBeenCalled();
    expect(text).not.toMatch(
      /rawMatch|seriesMatch|renderData|MatchInfo|CoreStats|PlayerTeamStats|accessToken|refreshToken|DISCORD_TOKEN|cached-raw-data/,
    );
  });

  it("preserves identical fresh and cached manual substitution and side-swap mapping", async () => {
    getMatchDetailsSpy.mockImplementation(async ([id]) =>
      Promise.resolve([aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0", id !== "match-0")]),
    );
    appDataGetSpy.mockResolvedValueOnce(null).mockResolvedValueOnce(MATCH_IDS);
    const fresh = await seriesDetailContract.fromResponse(await request());
    appDataGetSpy
      .mockResolvedValueOnce(aFakeDiscordSeriesStatsResolvedWith(["stale"]))
      .mockResolvedValueOnce(MATCH_IDS);
    const cachedResponse = await request();
    const cached = await seriesDetailContract.fromResponse(cachedResponse);
    expect(cached).toEqual(fresh);
    expect(detailAt(cached, 1).teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(detailAt(cached, 1).score.primary?.teams).toEqual([
      { matchTeamId: 7, seriesTeamId: 3, value: 50 },
      { matchTeamId: 3, seriesTeamId: 7, value: 40 },
    ]);
    expect(cached.aggregation).toMatchObject({
      status: "resolved",
      gamesPlayed: 2,
    });
    if (cached.aggregation.status !== "resolved") {
      throw new Error("Expected resolved aggregate");
    }
    expect(cached.aggregation.players.find((player) => player.playerId === "0900000000000000")).toMatchObject({
      gamesPlayed: 1,
      teamStats: [{ seriesTeamId: 7, gamesPlayed: 1 }],
    });
    expect(appDataGetSpy).toHaveBeenCalledWith(getDiscordSeriesStatsMatchIdsKey(GUILD_ID, QUEUE_NUMBER), {
      type: "json",
    });
    expect(getSeriesStatsSpy).not.toHaveBeenCalled();
    expect(cachedResponse.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not let a query opt a normal substituted series into manual mapping", async () => {
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: MATCH_IDS,
    });
    getMatchDetailsSpy.mockImplementation(async ([id]) =>
      Promise.resolve([aFakeSeriesDetailMatchWith(id === "match-0" ? 0 : 1, id !== "match-0", id !== "match-0")]),
    );
    const series = await seriesDetailContract.fromResponse(await request(undefined, "?isManualSeries=true"));
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
  });

  it.each([
    { status: "pending-index", retryAfterSeconds: 2.5, httpStatus: 503 },
    { status: "forbidden", reason: "Missing permissions", httpStatus: 403 },
    { status: "not-found", reason: "No overview", httpStatus: 404 },
  ])("preserves $status with no-store and no Halo preparation", async ({ httpStatus, ...state }) => {
    const lookup = discordSeriesStatsContract.parse({ ...state, guildId: GUILD_ID, queueNumber: QUEUE_NUMBER });
    getSeriesStatsLookupSpy.mockResolvedValue(lookup);
    const response = await request();
    expect(response.status).toBe(httpStatus);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe(state.status === "pending-index" ? "3" : null);
    expect(await discordSeriesStatsContract.fromResponse(response)).toEqual(lookup);
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
  });

  it.each(["abc/7777", `${GUILD_ID}/0`, `${GUILD_ID}/-1`, `${GUILD_ID}/9007199254740992`])(
    "rejects invalid params %s without lookup",
    async (path) => {
      const response = await request(path);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(getSeriesStatsLookupSpy).not.toHaveBeenCalled();
      expect(appDataGetSpy).not.toHaveBeenCalled();
      expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    },
  );

  it.each(
    [[], Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`), ["x".repeat(129)]].map((matchIds) => ({
      matchIds,
    })),
  )("fails unsupported source IDs %j explicitly instead of truncating", async ({ matchIds }) => {
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds,
    });
    const response = await request();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Failed to resolve discord series detail" });
    expect(logErrorSpy).toHaveBeenCalledOnce();
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
  });

  it.each(["lookup", "match", "metadata"])("logs %s failures without exposing error details", async (phase) => {
    const error = new Error("accessToken=secret");
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: MATCH_IDS,
    });
    if (phase === "lookup") {
      getSeriesStatsLookupSpy.mockRejectedValue(error);
    } else if (phase === "match") {
      getMatchDetailsSpy.mockRejectedValue(error);
    } else {
      getPlayerXuidsToGametagsSpy.mockRejectedValue(error);
    }
    const response = await request();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Failed to resolve discord series detail" });
    expect(logErrorSpy).toHaveBeenCalledExactlyOnceWith(
      error,
      new Map([["context", "Failed to resolve discord series detail route"]]),
    );
  });

  it("keeps missing and HTTP-failed matches explicit with unavailable totals", async () => {
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: MATCH_IDS,
    });
    getMatchDetailsSpy
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new RequestError(new Request("https://halo.test"), new Response(null, { status: 503 })));
    const series = await seriesDetailContract.fromResponse(await request());
    expect(series.matches.results).toEqual([
      { status: "unavailable", matchId: "match-0", reason: "not-found" },
      { status: "unavailable", matchId: "match-1", reason: "fetch-failed" },
    ]);
    expect(series.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(logErrorSpy).toHaveBeenCalledOnce();
  });

  it("accepts the 30-ID boundary while loading and aggregating distinct matches once", async () => {
    const matchIds = Array.from({ length: 30 }, () => "match-0");
    getSeriesStatsLookupSpy.mockResolvedValue({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds,
    });
    const series = await seriesDetailContract.fromResponse(await request());
    expect(series.matches.matchIds).toEqual(matchIds);
    expect(series.matches.results).toHaveLength(30);
    expect(series.aggregation).toMatchObject({ status: "resolved", gamesPlayed: 1 });
    expect(getMatchDetailsSpy).toHaveBeenCalledExactlyOnceWith(["match-0"]);
  });

  it("fails closed when cached manual-marker recovery fails", async () => {
    appDataGetSpy
      .mockResolvedValueOnce(aFakeDiscordSeriesStatsResolvedWith(MATCH_IDS))
      .mockRejectedValueOnce(new Error("KV unavailable"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Failed to resolve discord series detail" });
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    expect(logErrorSpy).toHaveBeenCalledOnce();
  });
});

describe("DiscordService.getSeriesStatsDetailLookup", () => {
  let env: Env;
  let services: Services;
  let appDataGetSpy: MockInstance<(...args: Parameters<Env["APP_DATA"]["get"]>) => Promise<unknown>>;
  let discordFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    env = aFakeEnvWith();
    discordFetch = vi.fn<typeof fetch>();
    services = installFakeServicesWith({ env, discordService: aFakeDiscordServiceWith({ env, fetch: discordFetch }) });
    appDataGetSpy = vi.spyOn(env.APP_DATA, "get");
    appDataGetSpy.mockResolvedValue(null);
  });

  it.each([false, true])("strips cached render data and recovers the existing manual marker (%s)", async (manual) => {
    appDataGetSpy
      .mockResolvedValueOnce(aFakeDiscordSeriesStatsResolvedWith(MATCH_IDS))
      .mockResolvedValueOnce(manual ? ["authoritative"] : null);
    expect(await services.discordService.getSeriesStatsDetailLookup(GUILD_ID, QUEUE_NUMBER)).toEqual({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: manual ? ["authoritative"] : MATCH_IDS,
      isManualSeries: manual,
    });
    expect(appDataGetSpy.mock.calls).toEqual([
      [getDiscordSeriesStatsCacheKey(GUILD_ID, QUEUE_NUMBER), { type: "json" }],
      [getDiscordSeriesStatsMatchIdsKey(GUILD_ID, QUEUE_NUMBER), { type: "json" }],
    ]);
  });

  it("propagates manual marker recovery failures rather than using normal mapping", async () => {
    const error = new Error("KV failed");
    appDataGetSpy.mockResolvedValueOnce(aFakeDiscordSeriesStatsResolvedWith(MATCH_IDS)).mockRejectedValueOnce(error);
    await expect(services.discordService.getSeriesStatsDetailLookup(GUILD_ID, QUEUE_NUMBER)).rejects.toBe(error);
  });

  it.each(["pending-index", "not-found"] as const)("uses the manual marker over cached %s", async (status) => {
    const cached = discordSeriesStatsContract.parse({
      status,
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      ...(status === "pending-index" ? { retryAfterSeconds: 1 } : { reason: "No overview" }),
    });
    appDataGetSpy.mockResolvedValueOnce(cached).mockResolvedValueOnce(["manual"]);
    expect(await services.discordService.getSeriesStatsDetailLookup(GUILD_ID, QUEUE_NUMBER)).toEqual({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: ["manual"],
      isManualSeries: true,
    });
    expect(appDataGetSpy).toHaveBeenCalledTimes(2);
  });

  it("preserves forbidden lookup results without checking the manual marker", async () => {
    const forbidden = discordSeriesStatsContract.parse({
      status: "forbidden",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      reason: "Missing permissions",
    });
    vi.spyOn(services.discordService, "getSeriesStatsLookup").mockResolvedValue(forbidden);
    expect(await services.discordService.getSeriesStatsDetailLookup(GUILD_ID, QUEUE_NUMBER)).toEqual(forbidden);
    expect(appDataGetSpy).not.toHaveBeenCalled();
  });

  it("resolves fresh normal series through the existing Discord search", async () => {
    discordFetch.mockResolvedValue(
      Response.json({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            {
              embeds: [
                {
                  color: EmbedColors.INFO,
                  type: EmbedType.Rich,
                  title: "Series stats for queue #7777",
                  fields: [{ name: "Game", value: "[Slayer](https://halodatahive.com/Infinite/Match/match-0)" }],
                },
              ],
            },
          ],
        ],
      }),
    );
    expect(await services.discordService.getSeriesStatsDetailLookup(GUILD_ID, QUEUE_NUMBER)).toEqual({
      status: "lookup-resolved",
      guildId: GUILD_ID,
      queueNumber: QUEUE_NUMBER,
      matchIds: ["match-0"],
    });
    expect(discordFetch).toHaveBeenCalledOnce();
    expect(appDataGetSpy).toHaveBeenCalledWith(getDiscordSeriesStatsMatchIdsKey(GUILD_ID, QUEUE_NUMBER), {
      type: "json",
    });
  });
});
