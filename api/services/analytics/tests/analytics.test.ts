import { GameVariantCategory } from "halo-infinite-api";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import type { DatabaseService } from "../../database/database";
import type { HaloService } from "../../halo/halo";
import type { HaloFilmService } from "../../halo/halo-film";
import type { LogService } from "../../log/types";
import { AnalyticsService } from "../analytics";

describe("AnalyticsService.getBatchMatchAnalytics", () => {
  let databaseService: DatabaseService;
  let haloService: HaloService;
  let haloFilmService: HaloFilmService;
  let logService: LogService;
  let service: AnalyticsService;

  beforeEach(() => {
    const env = aFakeEnvWith();
    databaseService = aFakeDatabaseServiceWith({ env });
    haloService = aFakeHaloServiceWith({ env });
    haloFilmService = aFakeHaloFilmServiceWith({ env });
    logService = aFakeLogServiceWith();
    service = new AnalyticsService({ databaseService, haloService, haloFilmService, logService });
  });

  it("resolves auth once then returns results keyed by matchId", async () => {
    const warmAuthCacheSpy = vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [{ killerXuid: "killer", victimXuid: "victim", count: 2, headshotKills: 0, perfects: 1, weapons: [] }],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const replaceMatchKillMatrixSpy = vi.spyOn(databaseService, "replaceMatchKillMatrix").mockResolvedValue();
    const results = await service.getBatchMatchAnalytics(["match-1", "match-2"], ["killMatrix"]);

    expect(warmAuthCacheSpy).toHaveBeenCalledOnce();
    expect(results["match-1"]).not.toBeNull();
    expect(results["match-2"]).not.toBeNull();
    expect(replaceMatchKillMatrixSpy).not.toHaveBeenCalled();
  });

  it("persists kill matrix rows when explicitly requested", async () => {
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [{ killerXuid: "killer", victimXuid: "victim", count: 2, headshotKills: 0, perfects: 1, weapons: [] }],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });

    const replaceMatchKillMatrixSpy = vi.spyOn(databaseService, "replaceMatchKillMatrix").mockResolvedValue();
    await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"], { persistKillMatrix: true });

    expect(replaceMatchKillMatrixSpy).toHaveBeenCalledWith("9535b946-f30c-4a43-b852-000000slayer", [
      expect.objectContaining({ Count: 2, Perfects: 1 }),
    ]);
  });

  it("continues returning analytics when optional persistence fails", async () => {
    const logWarnSpy = vi.spyOn(logService, "warn");
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [{ killerXuid: "killer", victimXuid: "victim", count: 2, headshotKills: 0, perfects: 1, weapons: [] }],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    vi.spyOn(databaseService, "replaceMatchKillMatrix").mockRejectedValue(new Error("db down"));

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"], { persistKillMatrix: true });

    expect(results["match-1"]).not.toBeNull();
    expect(logWarnSpy).toHaveBeenCalledWith(
      expect.any(Error),
      new Map([
        ["matchId", "9535b946-f30c-4a43-b852-000000slayer"],
        ["context", "persist match kill matrix"],
      ]),
    );
  });

  it("returns null for failed matches without affecting successful ones", async () => {
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

    const results = await service.getBatchMatchAnalytics(["match-ok", "match-fail"], ["killMatrix"]);

    expect(results["match-ok"]).not.toBeNull();
    expect(results["match-fail"]).toBeNull();
  });

  it("logs a warning and returns null for all matches when auth pre-warm fails", async () => {
    const logWarnSpy = vi.spyOn(logService, "warn");
    vi.spyOn(haloFilmService, "warmAuthCache").mockRejectedValue(new Error("auth down"));
    const getMatchDetailsSpy = vi.spyOn(haloService, "getMatchDetails").mockRejectedValue(new Error("auth down"));

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"]);

    expect(logWarnSpy).toHaveBeenCalledOnce();
    expect(getMatchDetailsSpy).toHaveBeenCalledOnce();
    expect(results["match-1"]).toBeNull();
  });

  it("returns scoreProgression timeline when scoreProgression module is requested for a kill-race mode", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    vi.spyOn(haloFilmService, "buildKillRaceProgression").mockResolvedValue({
      events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
      deathTimeline: [{ timestampMs: 5100, teamId: 1 }],
      teamCount: 2,
    });

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.requestedModules).toContain("killMatrix");
    expect(results["match-1"]?.scoreProgression).not.toBeNull();
    expect(results["match-1"]?.scoreProgression?.mode).toBe(GameVariantCategory.MultiplayerSlayer);
    expect(results["match-1"]?.scoreProgression?.durationMs).toBe(525500);
    expect(results["match-1"]?.scoreProgression?.teamCount).toBe(2);
    const timeline = results["match-1"]?.scoreProgression?.timeline;
    expect(timeline?.type).toBe("kill-race");
    expect(timeline?.events).toHaveLength(1);
    expect(timeline?.type === "kill-race" ? timeline.respawnDurationMs : undefined).toBe(8000);
    expect(timeline?.type === "kill-race" ? timeline.deathTimeline : undefined).toEqual([
      { timestampMs: 5100, teamId: 1 },
    ]);
  });

  it("returns scoreProgression null when scoreProgression module is requested but match has no teams", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    const noTeamsMatchStats = { ...matchStats, Teams: [] };
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([noTeamsMatchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    const buildKillRaceProgressionSpy: MockInstance<typeof haloFilmService.buildKillRaceProgression> = vi.spyOn(
      haloFilmService,
      "buildKillRaceProgression",
    );

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.scoreProgression).toBeNull();
    expect(buildKillRaceProgressionSpy).not.toHaveBeenCalled();
  });

  it("normalizes requestedModules to always include killMatrix when only scoreProgression is requested", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    vi.spyOn(haloFilmService, "buildKillRaceProgression").mockResolvedValue({
      events: [],
      deathTimeline: [],
      teamCount: 2,
    });

    const results = await service.getBatchMatchAnalytics(["match-1"], ["scoreProgression"]);

    expect(results["match-1"]?.requestedModules).toContain("killMatrix");
    expect(results["match-1"]?.requestedModules).toContain("scoreProgression");
  });

  it("returns scoreProgression null when scoreProgression module is not requested", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    const buildKillRaceProgressionSpy: MockInstance<typeof haloFilmService.buildKillRaceProgression> = vi.spyOn(
      haloFilmService,
      "buildKillRaceProgression",
    );

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"]);

    expect(results["match-1"]?.scoreProgression).toBeNull();
    expect(buildKillRaceProgressionSpy).not.toHaveBeenCalled();
  });

  it("returns scoreProgression with koth timeline for KOTH when scoreProgression is requested", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockResolvedValue({
      entries: [],
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 0 },
      perfectCounts: { total: 0, byXuid: {} },
    });
    vi.spyOn(haloFilmService, "buildKothProgression").mockResolvedValue({
      events: [{ timestampMs: 100000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
      controlPeriods: [{ startMs: 0, endMs: 732278, controllingTeamId: 0 }],
      hillCaptureTimestamps: [100000],
      teamCount: 2,
    });

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.scoreProgression).not.toBeNull();
    const timeline = results["match-1"]?.scoreProgression?.timeline;
    expect(timeline?.type).toBe("koth");
    expect(timeline?.type === "koth" ? timeline.hillCaptureTimestamps : undefined).toEqual([100000]);
  });

  it("returns scoreProgression null for unsupported game modes when scoreProgression is requested", async () => {
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
    const buildKillRaceProgressionSpy: MockInstance<typeof haloFilmService.buildKillRaceProgression> = vi.spyOn(
      haloFilmService,
      "buildKillRaceProgression",
    );

    const results = await service.getBatchMatchAnalytics(["match-1"], ["killMatrix", "scoreProgression"]);

    expect(results["match-1"]?.scoreProgression).toBeNull();
    expect(buildKillRaceProgressionSpy).not.toHaveBeenCalled();
  });

  it("rejects with an Error when film extraction throws a non-Error value", async () => {
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloFilmService, "buildKillMatrixAnalytics").mockRejectedValue("transient-failure");

    await expect(service.persistMatchKillMatrix(matchStats)).rejects.toBeInstanceOf(Error);
  });
});
