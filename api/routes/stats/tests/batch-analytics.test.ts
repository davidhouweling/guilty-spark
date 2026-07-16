import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogService } from "../../../services/log/types";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { AnalyticsService } from "../../../services/analytics/analytics";
import { aFakeMatchAnalyticsWith } from "../../../services/analytics/fakes/analytics.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/match-analytics (batch)", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns results keyed by matchId with no-store cache header", async () => {
    const analytics = aFakeMatchAnalyticsWith();

    const services = installFakeServicesWith({ env });
    const getBatchMatchAnalyticsSpy: MockInstance<AnalyticsService["getBatchMatchAnalytics"]> = vi.spyOn(
      services.analyticsService,
      "getBatchMatchAnalytics",
    );
    getBatchMatchAnalyticsSpy.mockResolvedValue({ "match-1": analytics, "match-2": analytics });
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
    expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledOnce();
    expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith(["match-1", "match-2"], ["killMatrix"]);
  });

  it("returns null for matchIds that fail, successful ones with data, and logs the failure count", async () => {
    const analytics = aFakeMatchAnalyticsWith();

    const services = installFakeServicesWith({ env });
    vi.spyOn(services.analyticsService, "getBatchMatchAnalytics").mockResolvedValue({
      "match-ok": analytics,
      "match-fail": null,
    });
    const logWarnSpy: MockInstance<LogService["warn"]> = vi.spyOn(services.logService, "warn");
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
    expect(logWarnSpy).toHaveBeenCalledOnce();
    expect(logWarnSpy).toHaveBeenCalledWith(
      "1/2 match analytics fetches failed",
      new Map([["route", "stats:match-analytics-batch"]]),
    );
  });

  it("returns 400 when matchIds param is missing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(new Request("http://localhost/api/stats/match-analytics"), env)) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("returns 400 for unsupported modules", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&modules=fooBar"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("passes scoreProgression module to analytics service when requested", async () => {
    const analytics = aFakeMatchAnalyticsWith();

    const services = installFakeServicesWith({ env });
    const getBatchMatchAnalyticsSpy: MockInstance<AnalyticsService["getBatchMatchAnalytics"]> = vi.spyOn(
      services.analyticsService,
      "getBatchMatchAnalytics",
    );
    getBatchMatchAnalyticsSpy.mockResolvedValue({ "match-1": analytics });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&modules=killMatrix,scoreProgression"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith(["match-1"], ["killMatrix", "scoreProgression"]);
    const body = await response.json();
    expect(body).toEqual({ results: { "match-1": analytics } });
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

  it("treats blank trackerId as absent and skips credential resolution", async () => {
    const analytics = aFakeMatchAnalyticsWith();
    const services = installFakeServicesWith({ env });
    const getTrackerSpy = vi.spyOn(services.databaseService, "getIndividualTracker");
    const getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
    vi.spyOn(services.analyticsService, "getBatchMatchAnalytics").mockResolvedValue({ "match-1": analytics });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&trackerId=%20%20"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(getTrackerSpy).not.toHaveBeenCalled();
    expect(getClientForUserSpy).not.toHaveBeenCalled();
  });

  it("does not resolve user credentials when tracker is not live", async () => {
    const analytics = aFakeMatchAnalyticsWith();
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(
      aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "owner-user-1", IsLive: 0 }),
    );
    const getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
    vi.spyOn(services.analyticsService, "getBatchMatchAnalytics").mockResolvedValue({ "match-1": analytics });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&trackerId=tracker-1"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(getClientForUserSpy).not.toHaveBeenCalled();
  });

  it("falls back to bot analytics service and logs when tracker lookup throws", async () => {
    const analytics = aFakeMatchAnalyticsWith();
    const services = installFakeServicesWith({ env });
    const lookupError = new Error("db down");
    vi.spyOn(services.databaseService, "getIndividualTracker").mockRejectedValue(lookupError);
    vi.spyOn(services.analyticsService, "getBatchMatchAnalytics").mockResolvedValue({ "match-1": analytics });
    const logErrorSpy: MockInstance<LogService["error"]> = vi.spyOn(services.logService, "error");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics?matchIds=match-1&trackerId=tracker-1"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(logErrorSpy).toHaveBeenCalledWith(
      lookupError,
      new Map([
        ["context", "Failed to resolve user credentials for batch analytics tracker"],
        ["trackerId", "tracker-1"],
      ]),
    );
  });
});
