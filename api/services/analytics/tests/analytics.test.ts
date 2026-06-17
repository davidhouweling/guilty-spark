import { describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { AnalyticsService } from "../analytics";

describe("AnalyticsService", () => {
  it("returns killMatrix analytics for supported module", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });

    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([
      Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
    ]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
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

    const service = new AnalyticsService({ haloService, haloFilmService });

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
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const service = new AnalyticsService({ haloService, haloFilmService });

    await expect(service.getMatchAnalytics("match-123", ["scoreProgression"])).rejects.toThrow(
      "No supported analytics modules requested",
    );
  });
});

describe("AnalyticsService.getBatchMatchAnalytics", () => {
  it("resolves auth once then returns results keyed by matchId", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const resolveAuthSpy = vi.spyOn(haloFilmService, "resolveAuthContext").mockResolvedValue({
      spartanToken: "spartan-token",
      clearanceToken: "clearance-token",
    });
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const service = new AnalyticsService({ haloService, haloFilmService });
    const results = await service.getBatchMatchAnalytics(["match-1", "match-2"], ["killMatrix"]);

    expect(resolveAuthSpy).toHaveBeenCalledOnce();
    expect(results["match-1"]).not.toBeNull();
    expect(results["match-2"]).not.toBeNull();
  });

  it("returns null for failed matches without affecting successful ones", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    vi.spyOn(haloFilmService, "resolveAuthContext").mockResolvedValue({
      spartanToken: "spartan-token",
      clearanceToken: "clearance-token",
    });
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails")
      .mockResolvedValueOnce([matchStats])
      .mockRejectedValueOnce(new Error("halo api down"));
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const service = new AnalyticsService({ haloService, haloFilmService });
    const results = await service.getBatchMatchAnalytics(["match-ok", "match-fail"], ["killMatrix"]);

    expect(results["match-ok"]).not.toBeNull();
    expect(results["match-fail"]).toBeNull();
  });
});
