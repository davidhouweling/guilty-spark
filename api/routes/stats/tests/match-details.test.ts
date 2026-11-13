import type { AutoRouterType } from "itty-router";
import { RequestError } from "halo-infinite-api";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeHaloInfiniteClient } from "../../../services/halo/fakes/infinite-client.fake";
import { getMedalsMetadata } from "../../../services/halo/fakes/data";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/match-details", () => {
  let env: Env;
  let router: AutoRouterType;
  let services: Services;
  let getMatchDetails: MockInstance<HaloService["getMatchDetails"]>;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
    services = installFakeServicesWith({ env });
    getMatchDetails = vi
      .spyOn(services.haloService, "getMatchDetails")
      .mockImplementation(async ([id]) =>
        Promise.resolve([aFakeMatchStatsWith({ MatchId: Preconditions.checkExists(id) })]),
      );
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
    return (await router.fetch(new Request(`http://localhost/api/stats/match-details${query}`), env)) as Response;
  }

  it("returns ordered duplicates and missing results without exposing raw matches", async () => {
    getMatchDetails.mockImplementation(async ([id]) => {
      if (id === "missing") {
        throw new RequestError(new URL("https://example.com"), new Response("", { status: 404 }));
      }
      return Promise.resolve([aFakeMatchStatsWith({ MatchId: Preconditions.checkExists(id) })]);
    });
    const response = await request("?matchIds=second,missing,first,second");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const raw = await response.clone().json();
    const batch = await matchDetailContract.fromResponse(response);
    expect(batch.matchIds).toEqual(["second", "missing", "first", "second"]);
    expect(batch.results).toEqual([
      expect.objectContaining({ status: "resolved", matchId: "second" }),
      { status: "unavailable", matchId: "missing", reason: "not-found" },
      expect.objectContaining({ status: "resolved", matchId: "first" }),
      expect.objectContaining({ status: "resolved", matchId: "second" }),
    ]);
    expect(batch.results[0]).toEqual(batch.results[3]);
    expect(getMatchDetails.mock.calls).toEqual([[["second"]], [["missing"]], [["first"]]]);
    expect(JSON.stringify(raw)).not.toMatch(/rawMatches|rawMatch|MatchInfo|CoreStats|PlayerTeamStats/);
  });

  it.each([
    "",
    "?matchIds=",
    "?matchIds=one,,two",
    `?matchIds=${"a".repeat(129)}`,
    `?matchIds=${Array.from({ length: 31 }, () => "one").join(",")}`,
  ])("rejects invalid query %s before looking up credentials", async (query) => {
    const getTracker = vi.spyOn(services.databaseService, "getIndividualTracker");
    const response = await request(query);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Invalid query parameters" });
    expect(getMatchDetails).not.toHaveBeenCalled();
    expect(getTracker).not.toHaveBeenCalled();
  });

  it("uses bot credentials without a tracker or with a blank tracker", async () => {
    const getTracker = vi.spyOn(services.databaseService, "getIndividualTracker");
    expect((await request("?matchIds=one")).status).toBe(200);
    expect((await request("?matchIds=one&trackerId=%20%20")).status).toBe(200);
    expect(getTracker).not.toHaveBeenCalled();
    expect(getMatchDetails).toHaveBeenCalledTimes(2);
  });

  it("uses the live tracker owner client for detail preparation", async () => {
    const userClient = aFakeHaloInfiniteClient();
    const ownerService = aFakeHaloServiceWith();
    const ownerFetch = vi.spyOn(ownerService, "getMatchDetails").mockResolvedValue([]);
    const getTracker = vi
      .spyOn(services.databaseService, "getIndividualTracker")
      .mockResolvedValue(aFakeIndividualTrackersRow({ TrackerId: "tracker", UserId: "owner", IsLive: 1 }));
    const getClient = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(userClient);
    const withClient = vi.spyOn(services.haloService, "withUserClient").mockReturnValue(ownerService);
    const response = await request("?matchIds=one&trackerId=%20tracker%20");
    expect(response.status).toBe(200);
    expect((await matchDetailContract.fromResponse(response)).results).toEqual([
      { status: "unavailable", matchId: "one", reason: "not-found" },
    ]);
    expect(getTracker).toHaveBeenCalledWith("tracker");
    expect(getClient).toHaveBeenCalledWith("owner");
    expect(withClient).toHaveBeenCalledWith(userClient);
    expect(ownerFetch).toHaveBeenCalledWith(["one"]);
    expect(getMatchDetails).not.toHaveBeenCalled();
  });

  it.each(["missing", "inactive", "signed-out"])("uses bot credentials for a %s tracker owner", async (state) => {
    const getTracker = vi.spyOn(services.databaseService, "getIndividualTracker");
    const getClient = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(null);
    const withClient = vi.spyOn(services.haloService, "withUserClient");
    getTracker.mockResolvedValue(
      state === "missing"
        ? null
        : aFakeIndividualTrackersRow({ UserId: "owner", IsLive: state === "inactive" ? 0 : 1 }),
    );
    const response = await request("?matchIds=one&trackerId=tracker");
    expect(response.status).toBe(200);
    expect(getMatchDetails).toHaveBeenCalledWith(["one"]);
    expect(withClient).not.toHaveBeenCalled();
    expect(getClient).toHaveBeenCalledTimes(state === "signed-out" ? 1 : 0);
  });

  it("logs owner resolution errors and falls back to bot", async () => {
    const error = new Error("database unavailable");
    vi.spyOn(services.databaseService, "getIndividualTracker").mockRejectedValue(error);
    const logError = vi.spyOn(services.logService, "error");
    const response = await request("?matchIds=one&trackerId=tracker");
    expect(response.status).toBe(200);
    expect(getMatchDetails).toHaveBeenCalledWith(["one"]);
    expect(logError).toHaveBeenCalledWith(
      error,
      new Map([
        ["context", "Failed to resolve user credentials for match details tracker"],
        ["trackerId", "tracker"],
      ]),
    );
  });

  it("returns per-match failures for upstream HTTP errors", async () => {
    const error = new RequestError(new URL("https://example.com"), new Response("", { status: 403 }));
    getMatchDetails.mockRejectedValue(error);
    const logError = vi.spyOn(services.logService, "error");
    const response = await request("?matchIds=one");
    expect(response.status).toBe(200);
    expect((await matchDetailContract.fromResponse(response)).results).toEqual([
      { status: "unavailable", matchId: "one", reason: "forbidden" },
    ]);
    expect(logError).toHaveBeenCalledWith(error, new Map([["matchId", "one"]]));
  });

  it("returns a logged no-store error for unexpected preparation failures", async () => {
    const error = new Error("unexpected");
    getMatchDetails.mockRejectedValue(error);
    const logError = vi.spyOn(services.logService, "error");
    const response = await request("?matchIds=one");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Failed to resolve match details" });
    expect(logError).toHaveBeenCalledWith(error, new Map([["context", "Failed to resolve match details route"]]));
  });
});
