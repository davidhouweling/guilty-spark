import { describe, expect, it, vi } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { MatchProgressionService } from "../match-progression";

describe("MatchProgressionService.getMatchScoreProgression", () => {
  it("returns kill-race timeline with running scores for each kill event", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildSlayerProgression").mockResolvedValue({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 12000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
    });

    const service = new MatchProgressionService({ haloService, haloFilmService, logService });
    const result = await service.getMatchScoreProgression("9535b946-f30c-4a43-b852-000000slayer");

    expect(result.matchId).toBe("9535b946-f30c-4a43-b852-000000slayer");
    expect(result.mode).toBe(GameVariantCategory.MultiplayerSlayer);
    expect(result.teamCount).toBe(matchStats.Teams.length);
    expect(result.targetScore).toBeNull();
    expect(result.timeline.type).toBe("kill-race");
    expect(result.timeline.events).toHaveLength(2);
    expect(result.timeline.events[0]).toEqual({ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } });
  });

  it("warms auth cache in parallel with match details fetch", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    const warmAuthCacheSpy = vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildSlayerProgression").mockResolvedValue({ events: [] });

    const service = new MatchProgressionService({ haloService, haloFilmService, logService });
    await service.getMatchScoreProgression("9535b946-f30c-4a43-b852-000000slayer");

    expect(warmAuthCacheSpy).toHaveBeenCalledOnce();
  });

  it("continues and logs a warning when auth pre-warm fails", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockRejectedValue(new Error("auth down"));
    vi.spyOn(haloFilmService, "buildSlayerProgression").mockResolvedValue({ events: [] });
    const logWarnSpy = vi.spyOn(logService, "warn");

    const service = new MatchProgressionService({ haloService, haloFilmService, logService });
    const result = await service.getMatchScoreProgression("9535b946-f30c-4a43-b852-000000slayer");

    expect(logWarnSpy).toHaveBeenCalledOnce();
    expect(result.timeline.events).toHaveLength(0);
  });

  it("throws when the match game mode does not support kill-race progression", async () => {
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

    const service = new MatchProgressionService({ haloService, haloFilmService, logService });

    await expect(service.getMatchScoreProgression("ctf-match-id")).rejects.toThrow(
      "does not support kill-race score progression",
    );
  });

  it("returns empty events array when no kills are recorded in film data", async () => {
    const env = aFakeEnvWith();
    const haloService = aFakeHaloServiceWith({ env });
    const haloFilmService = aFakeHaloFilmServiceWith({ env });
    const logService = aFakeLogServiceWith();
    const matchStats = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    vi.spyOn(haloFilmService, "warmAuthCache").mockResolvedValue(undefined);
    vi.spyOn(haloFilmService, "buildSlayerProgression").mockResolvedValue({ events: [] });

    const service = new MatchProgressionService({ haloService, haloFilmService, logService });
    const result = await service.getMatchScoreProgression("9535b946-f30c-4a43-b852-000000slayer");

    expect(result.timeline.events).toHaveLength(0);
  });
});
