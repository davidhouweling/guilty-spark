import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { MatchProgressionService } from "../../../services/analytics/match-progression";
import { aFakeMatchScoreProgressionWith } from "../../../services/analytics/fakes/match-progression.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/match-score-progression", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns score progression with no-store cache header", async () => {
    const progression = aFakeMatchScoreProgressionWith();
    const services = installFakeServicesWith({ env });
    const getProgressionSpy: MockInstance<MatchProgressionService["getMatchScoreProgression"]> = vi.spyOn(
      services.matchProgressionService,
      "getMatchScoreProgression",
    );
    getProgressionSpy.mockResolvedValue(progression);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-score-progression?matchId=test-match-id"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual(progression);
    expect(getProgressionSpy).toHaveBeenCalledOnce();
    expect(getProgressionSpy).toHaveBeenCalledWith("test-match-id");
  });

  it("returns 400 when matchId query param is missing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-score-progression"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });

  it("returns 400 when matchId is an empty string", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-score-progression?matchId="),
      env,
    )) as Response;

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid query parameters" });
  });
});
