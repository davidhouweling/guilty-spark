import { GameVariantCategory } from "halo-infinite-api";
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

  it("returns scoreProgression timeline when scoreProgression module is requested for a kill-race mode", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    vi.spyOn(haloFilmService, "buildSlayerProgression").mockResolvedValue({
      events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
    });

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.scoreProgression).not.toBeNull();
    expect(results["match-1"]?.scoreProgression?.timeline.type).toBe("kill-race");
    expect(results["match-1"]?.scoreProgression?.timeline.events).toHaveLength(1);
  });

  it("returns scoreProgression null when scoreProgression module is not requested", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    const buildSlayerProgressionSpy = vi.spyOn(haloFilmService, "buildSlayerProgression");

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"]);

    expect(results["match-1"]?.scoreProgression).toBeNull();
    expect(buildSlayerProgressionSpy).not.toHaveBeenCalled();
  });

  it("returns scoreProgression null for unsupported game modes when scoreProgression is requested", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    const ctfMatchStats = {
      ...matchStats,
      MatchInfo: { ...matchStats.MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerCtf },
    };
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([ctfMatchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    const buildSlayerProgressionSpy = vi.spyOn(haloFilmService, "buildSlayerProgression");

    const service = new AnalyticsService({ haloService, haloFilmService, logService });
    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.scoreProgression).toBeNull();
    expect(buildSlayerProgressionSpy).not.toHaveBeenCalled();
  });
});
