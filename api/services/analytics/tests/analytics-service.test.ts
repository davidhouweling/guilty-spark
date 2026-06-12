import { describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../fakes/services";
import { getMatchStats } from "../../halo/fakes/data";
import { HaloFilmService } from "../../halo/halo-film";
import { AnalyticsService } from "../analytics";

describe("AnalyticsService", () => {
  it("returns killMatrix analytics for supported module", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
      Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
    ]);
    vi.spyOn(HaloFilmService.prototype, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [
        {
          killerXuid: "2533274844642438",
          victimXuid: "2533274881185517",
          count: 2,
          headshotKills: 1,
          perfects: 1,
          weapons: [{ weaponId: 3009, count: 2 }],
        },
      ],
      pairingQuality: {
        unpairedDeathCount: 0,
        maxTimeDeltaMs: 1,
      },
      perfectCounts: {
        total: 1,
        byXuid: {
          "2533274844642438": 1,
        },
      },
    });

    const service = new AnalyticsService({ env, haloService: services.haloService });

    const analytics = await service.getMatchAnalytics("match-123", ["killMatrix"]);

    expect(analytics.requestedModules).toEqual(["killMatrix"]);
    expect(analytics.killMatrix).toEqual({
      "2533274844642438:2533274881185517": {
        count: 2,
        headshotKills: 1,
        perfects: 1,
        weapons: [{ weaponId: 3009, count: 2 }],
      },
    });
    expect(analytics.metadata).toEqual({
      pairingQuality: {
        unpairedDeathCount: 0,
        maxTimeDeltaMs: 1,
      },
      perfectCounts: {
        total: 1,
        byXuid: {
          "2533274844642438": 1,
        },
      },
    });
  });

  it("rejects when no supported modules are requested", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    const service = new AnalyticsService({ env, haloService: services.haloService });

    await expect(service.getMatchAnalytics("match-123", ["scoreProgression"])).rejects.toThrow(
      "No supported analytics modules requested",
    );
  });
});
