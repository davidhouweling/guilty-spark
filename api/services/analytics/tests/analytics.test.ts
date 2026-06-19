import { describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { AnalyticsService } from "../analytics";

describe("AnalyticsService.getBatchMatchAnalytics", () => {
  it("resolves auth once then returns results keyed by matchId", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const warmAuthCacheSpy = vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-1", "match-2"], ["killMatrix"]);

    expect(warmAuthCacheSpy).toHaveBeenCalledOnce();
    expect(results["match-1"]).not.toBeNull();
    expect(results["match-2"]).not.toBeNull();
  });

  it("returns null for failed matches without affecting successful ones", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails")
      .mockResolvedValueOnce([matchStats])
      .mockRejectedValueOnce(new Error("halo api down"));
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-ok", "match-fail"], ["killMatrix"]);

    expect(results["match-ok"]).not.toBeNull();
    expect(results["match-fail"]).toBeNull();
  });

  it("logs a warning and returns null for all matches when auth pre-warm fails", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const logWarnSpy = vi.spyOn(logService, "warn");
    vi.spyOn(haloFilmService, "warmAuthCache").mockRejectedValue(new Error("auth down"));
    const getMatchDetailsSpy = vi.spyOn(haloService, "getMatchDetails").mockRejectedValue(new Error("auth down"));

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"]);

    expect(logWarnSpy).toHaveBeenCalledOnce();
    expect(getMatchDetailsSpy).toHaveBeenCalledOnce();
    expect(results["match-1"]).toBeNull();
  });
});
