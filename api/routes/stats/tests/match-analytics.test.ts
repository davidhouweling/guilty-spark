import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import * as analyticsServiceModule from "../../../services/analytics/analytics-service";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/match-analytics/:matchId", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns analytics payload with cache header", async () => {
    const analytics: MatchAnalytics = {
      requestedModules: ["killMatrix"],
      killMatrix: {
        "2533274844642438:2533274881185517": {
          count: 8,
          headshotKills: 3,
          perfects: 2,
          weapons: [{ weaponId: 3009, count: 8 }],
        },
      },
      metadata: {
        pairingQuality: {
          unpairedDeathCount: 0,
          maxTimeDeltaMs: 1,
        },
        perfectCounts: {
          total: 11,
          byXuid: {
            "2533274844642438": 2,
          },
        },
      },
    };

    vi.spyOn(analyticsServiceModule, "createAnalyticsService").mockReturnValue({
      getMatchAnalytics: vi.fn().mockResolvedValue(analytics),
    });

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics/match-123?modules=killMatrix"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000");

    const body = await response.json();
    expect(body).toMatchObject({
      analytics: {
        requestedModules: ["killMatrix"],
        killMatrix: {
          "2533274844642438:2533274881185517": {
            count: 8,
            headshotKills: 3,
            perfects: 2,
          },
        },
      },
    });
  });

  it("returns 500 when analytics service throws", async () => {
    vi.spyOn(analyticsServiceModule, "createAnalyticsService").mockReturnValue({
      getMatchAnalytics: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/match-analytics/match-123"),
      env,
    )) as Response;

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "boom" });
  });
});
