import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

const aFakeAnalytics = (): MatchAnalytics => ({
  requestedModules: ["killMatrix"],
  killMatrix: {
    "2533274844642438:2533274881185517": {
      count: 3,
      headshotKills: 1,
      perfects: 0,
      weapons: [],
    },
  },
  metadata: {
    pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
    perfectCounts: { total: 0, byXuid: {} },
  },
});

describe("/api/stats/match-analytics (batch)", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns results keyed by matchId with no-store cache header", async () => {
    const analytics = aFakeAnalytics();

    const services = installFakeServicesWith({ env });
    const getMatchAnalyticsSpy: MockInstance<typeof services.analyticsService.getMatchAnalytics> = vi.spyOn(
      services.analyticsService,
      "getMatchAnalytics",
    );
    getMatchAnalyticsSpy.mockResolvedValue(analytics);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1,match-2&modules=killMatrix"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual({
      results: {
        "match-1": analytics,
        "match-2": analytics,
      },
    });
    expect(getMatchAnalyticsSpy).toHaveBeenCalledTimes(2);
    expect(getMatchAnalyticsSpy).toHaveBeenCalledWith("match-1", ["killMatrix"]);
    expect(getMatchAnalyticsSpy).toHaveBeenCalledWith("match-2", ["killMatrix"]);
  });

  it("returns null for matchIds that fail, successful ones with data, and logs the failure count", async () => {
    const analytics = aFakeAnalytics();

    const services = installFakeServicesWith({ env });
    vi.spyOn(services.analyticsService, "getMatchAnalytics")
      .mockResolvedValueOnce(analytics)
      .mockRejectedValueOnce(new Error("halo api down"));
    const logErrorSpy: MockInstance<typeof services.logService.error> = vi.spyOn(services.logService, "error");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-ok,match-fail"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      results: {
        "match-ok": analytics,
        "match-fail": null,
      },
    });
    expect(logErrorSpy).toHaveBeenCalledOnce();
    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "1/2 match analytics fetches failed" }),
      new Map([["route", "stats:match-analytics-batch"]]),
    );
  });

  it("returns 400 when matchIds param is missing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("returns 400 for unsupported modules", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&modules=scoreProgression"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("returns 400 when more than 30 matchIds are provided", async () => {
    const matchIds = Array.from({ length: 31 }, (_, i) => `match-${i.toString()}`).join(",");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(`http://localhost/api/stats/match-analytics?matchIds=${matchIds}`),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });
});
