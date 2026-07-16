import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seriesMatchesContract } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { LogService } from "../../../services/log/types";
import { aFakeHaloInfiniteClient } from "../../../services/halo/fakes/infinite-client.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { getMatchStats, getPlayerMatches } from "../../../services/halo/fakes/data";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/series-matches", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("carries game type and map separately without reparsing a joined string", async () => {
    const [playerMatch] = getPlayerMatches();
    if (playerMatch == null) {
      throw new Error("Expected fake player match data");
    }

    const match = getMatchStats(playerMatch.MatchId);
    if (match == null) {
      throw new Error("Expected fake match stats");
    }

    const services = installFakeServicesWith({ env });
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([match]);
    vi.spyOn(services.haloService, "getGameTypeAndMapParts").mockResolvedValue({
      gameType: "Assault:Neutral Bomb",
      gameMap: "Live Fire",
    });
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${playerMatch.MatchId}`),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    const body = await seriesMatchesContract.fromResponse(response);
    expect(body).not.toHaveProperty("medalMetadata");
    expect(body.matches[0]).toMatchObject({
      gameTypeAndMap: "Assault:Neutral Bomb: Live Fire",
      gameType: "Assault:Neutral Bomb",
      gameMap: "Live Fire",
    });
  });

  it("returns 400 when more than 30 matchIds are provided", async () => {
    const matchIds = Array.from({ length: 31 }, (_, i) => `match-${i.toString()}`).join(",");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${matchIds}`),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("returns matches in the same order as requested matchIds", async () => {
    const playerMatches = getPlayerMatches();
    const [firstPlayerMatch, secondPlayerMatch] = playerMatches;
    if (firstPlayerMatch == null || secondPlayerMatch == null) {
      throw new Error("Expected at least two fake player matches");
    }

    const firstMatch = getMatchStats(firstPlayerMatch.MatchId);
    const secondMatch = getMatchStats(secondPlayerMatch.MatchId);
    if (firstMatch == null || secondMatch == null) {
      throw new Error("Expected fake match stats");
    }

    const services = installFakeServicesWith({ env });
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([secondMatch, firstMatch]);
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${firstMatch.MatchId},${secondMatch.MatchId}`),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    const body = await seriesMatchesContract.fromResponse(response);
    expect(body.matches.map((match) => match.matchId)).toEqual([firstMatch.MatchId, secondMatch.MatchId]);
  });

  it("returns a consistent 500 error payload when upstream fetches fail", async () => {
    const [playerMatch] = getPlayerMatches();
    if (playerMatch == null) {
      throw new Error("Expected fake player match data");
    }

    const services = installFakeServicesWith({ env });
    vi.spyOn(services.haloService, "getMatchDetails").mockRejectedValue(new Error("boom"));
    const logErrorSpy: MockInstance<LogService["error"]> = vi.spyOn(services.logService, "error");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${playerMatch.MatchId}`),
      env,
    )) as Response;

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to resolve series matches" });
    expect(logErrorSpy).toHaveBeenCalledOnce();
    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.any(Error),
      new Map([["context", "Failed to resolve series matches route"]]),
    );
  });

  it("uses tracker owner credentials when trackerId resolves to a live tracker", async () => {
    const [playerMatch] = getPlayerMatches();
    if (playerMatch == null) {
      throw new Error("Expected fake player match data");
    }

    const match = getMatchStats(playerMatch.MatchId);
    if (match == null) {
      throw new Error("Expected fake match stats");
    }

    const services = installFakeServicesWith({ env });
    const userClient = aFakeHaloInfiniteClient();
    const getTrackerSpy = vi
      .spyOn(services.databaseService, "getIndividualTracker")
      .mockResolvedValue(aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "owner-user-1", IsLive: 1 }));
    const getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(userClient);
    const withUserClientSpy = vi.spyOn(services.haloService, "withUserClient").mockReturnValue(services.haloService);
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([match]);
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${playerMatch.MatchId}&trackerId=tracker-1`),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(getTrackerSpy).toHaveBeenCalledWith("tracker-1");
    expect(getClientForUserSpy).toHaveBeenCalledWith("owner-user-1");
    expect(withUserClientSpy).toHaveBeenCalledWith(userClient);
  });

  it("treats blank trackerId as absent and skips credential resolution", async () => {
    const [playerMatch] = getPlayerMatches();
    if (playerMatch == null) {
      throw new Error("Expected fake player match data");
    }

    const match = getMatchStats(playerMatch.MatchId);
    if (match == null) {
      throw new Error("Expected fake match stats");
    }

    const services = installFakeServicesWith({ env });
    const getTrackerSpy = vi.spyOn(services.databaseService, "getIndividualTracker");
    const getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([match]);
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${playerMatch.MatchId}&trackerId=%20%20`),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(getTrackerSpy).not.toHaveBeenCalled();
    expect(getClientForUserSpy).not.toHaveBeenCalled();
  });

  it("falls back to bot credentials and logs the error when tracker lookup throws", async () => {
    const [playerMatch] = getPlayerMatches();
    if (playerMatch == null) {
      throw new Error("Expected fake player match data");
    }

    const match = getMatchStats(playerMatch.MatchId);
    if (match == null) {
      throw new Error("Expected fake match stats");
    }

    const services = installFakeServicesWith({ env });
    const lookupError = new Error("db down");
    vi.spyOn(services.databaseService, "getIndividualTracker").mockRejectedValue(lookupError);
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([match]);
    vi.spyOn(services.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
    const logErrorSpy: MockInstance<LogService["error"]> = vi.spyOn(services.logService, "error");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/series-matches?matchIds=${playerMatch.MatchId}&trackerId=tracker-1`),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(logErrorSpy).toHaveBeenCalledWith(
      lookupError,
      new Map([
        ["context", "Failed to resolve user credentials for series matches tracker"],
        ["trackerId", "tracker-1"],
      ]),
    );
  });
});
