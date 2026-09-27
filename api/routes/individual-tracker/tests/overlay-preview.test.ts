import type { AutoRouterType } from "itty-router";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeMatchStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { overlayPreviewContract } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { getPlayerMatches } from "../../../services/halo/fakes/data";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

const TRACKED_XUID = "1111111111";

function aCustomMatch(matchId: string, startTime: string): MatchStats {
  const base = aFakeMatchStatsWith({ MatchId: matchId });
  return {
    ...base,
    MatchInfo: { ...base.MatchInfo, StartTime: startTime, EndTime: startTime, Playlist: null },
  };
}

function aPlayerMatch(stats: MatchStats): PlayerMatchHistory {
  const template = Preconditions.checkExists(getPlayerMatches().at(0), "player match fixture");
  return { ...template, MatchId: stats.MatchId, MatchInfo: stats.MatchInfo };
}

function withHistory(stats: readonly MatchStats[]): typeof installFakeServicesWith {
  return (opts) => {
    const services = installFakeServicesWith(opts);
    vi.spyOn(services.haloService, "getPlayerMatches").mockResolvedValue(stats.map(aPlayerMatch));
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([...stats]);
    return services;
  };
}

function withSession(installServicesFn: typeof installFakeServicesWith): typeof installFakeServicesWith {
  return (opts) => {
    const services = installServicesFn(opts);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(
      aFakeAuthSessionWith({ userId: "user-123", xboxXuid: TRACKED_XUID, xboxGamertag: "ChiefSpartan" }),
    );
    return services;
  };
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

describe("/api/individual-tracker/overlay-preview", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("serves the demo identity when there is no session", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(res.status).toBe(200);
    expect(body.isExample).toBe(true);
    expect(body.view.gamertag).toBe("soundmanD");
  });

  it("serves the session user's own identity when authenticated", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() =>
      withSession(withHistory(stats))({ env }),
    );
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.isExample).toBe(false);
    expect(body.view.gamertag).toBe("ChiefSpartan");
  });

  it("defaults to the matchmaking mode with no active series", async () => {
    const stats = [aCustomMatch("match-1", "2026-09-01T10:00:00.000Z")];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/overlay-preview"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.mode).toBe("matchmaking");
    expect(body.view.hasActiveSeries).toBe(false);
    expect(body.view.statsHighlights).toBeDefined();
  });

  it("builds an active series from grouped custom matches in series mode", async () => {
    const stats = [
      aCustomMatch("series-1", "2026-09-01T10:00:00.000Z"),
      aCustomMatch("series-2", "2026-09-01T10:30:00.000Z"),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => withHistory(stats)({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/overlay-preview?mode=series"), env)) as Response;
    const body = await overlayPreviewContract.fromResponse(res);

    expect(body.mode).toBe("series");
    expect(body.view.hasActiveSeries).toBe(true);
    expect(body.view.series).toHaveLength(1);
    expect(body.view.series[0]?.matchIds).toEqual(["series-1", "series-2"]);
    expect(body.view.activeSeriesContext?.title).toBe(body.view.series[0]?.title);
  });

  it("rejects an unknown preview mode", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      getRequest("/api/individual-tracker/overlay-preview?mode=nonsense"),
      env,
    )) as Response;

    expect(res.status).toBe(400);
  });
});
