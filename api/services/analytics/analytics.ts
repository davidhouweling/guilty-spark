import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import type {
  AnalyticsModule,
  MatchAnalytics,
  KillMatrixEntry as ContractKillMatrixEntry,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { KILL_RACE_RESPAWN_DURATION_MS } from "@guilty-spark/shared/halo/respawn-durations";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloService } from "../halo/halo";
import type { HaloFilmService } from "../halo/halo-film";
import type { LogService } from "../log/types";

export interface AnalyticsServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  logService: LogService;
}

// Escalation excluded: only active-weapon kills score, but film events carry no weapon field
const KILL_RACE_GAME_MODES = new Set([
  GameVariantCategory.MultiplayerSlayer,
  GameVariantCategory.MultiplayerFiesta,
  GameVariantCategory.MultiplayerAttrition,
]);

function toContractKillMatrix(
  entries: Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>["entries"],
): Record<string, ContractKillMatrixEntry> {
  const killMatrix: Record<string, ContractKillMatrixEntry> = {};
  for (const entry of entries) {
    const key = `${entry.killerXuid}:${entry.victimXuid}`;
    killMatrix[key] = {
      count: entry.count,
      headshotKills: entry.headshotKills,
      perfects: entry.perfects,
      weapons: entry.weapons,
    };
  }

  return killMatrix;
}

export class AnalyticsService {
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;
  private readonly logService: LogService;

  constructor({ haloService, haloFilmService, logService }: AnalyticsServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
    this.logService = logService;
  }

  private async getMatchAnalytics(matchId: string, modules: AnalyticsModule[]): Promise<MatchAnalytics> {
    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    // Sequential on purpose: the kill-matrix pass warms the film metadata/chunk caches that the
    // score-progression pass reads — running them concurrently duplicates the film fetch and
    // inflate work on a cold cache instead of sharing it.
    const killMatrixAnalytics = await this.haloFilmService.buildKillMatrixAnalytics(matchStats);
    const scoreProgression = modules.includes("scoreProgression")
      ? await this.buildScoreProgressionAnalytics(matchStats)
      : null;

    const requestedModules: AnalyticsModule[] = modules.includes("killMatrix") ? modules : ["killMatrix", ...modules];

    return {
      requestedModules,
      killMatrix: toContractKillMatrix(killMatrixAnalytics.entries),
      scoreProgression,
      metadata: {
        pairingQuality: killMatrixAnalytics.pairingQuality,
        perfectCounts: killMatrixAnalytics.perfectCounts,
      },
    };
  }

  private async buildScoreProgressionAnalytics(matchStats: MatchStats): Promise<MatchAnalytics["scoreProgression"]> {
    const mode = matchStats.MatchInfo.GameVariantCategory;
    const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
    if (matchStats.Teams.length === 0) {
      return null;
    }
    if (KILL_RACE_GAME_MODES.has(mode)) {
      const progression = await this.haloFilmService.buildKillRaceProgression(matchStats);
      return {
        mode,
        durationMs,
        teamCount: progression.teamCount,
        timeline: {
          type: "kill-race",
          events: progression.events,
          deathTimeline: progression.deathTimeline,
          respawnDurationMs: KILL_RACE_RESPAWN_DURATION_MS[mode] ?? null,
        },
      };
    }
    // Each objective mode gets its own timeline variant and builder; new modes add a branch here.
    if (mode === GameVariantCategory.MultiplayerKingOfTheHill) {
      const progression = await this.haloFilmService.buildKothProgression(matchStats, durationMs);
      return {
        mode,
        durationMs,
        teamCount: progression.teamCount,
        timeline: {
          type: "koth",
          events: progression.events,
          controlPeriods: progression.controlPeriods,
          hillCaptureTimestamps: progression.hillCaptureTimestamps,
        },
      };
    }
    return null;
  }

  async getBatchMatchAnalytics(
    matchIds: string[],
    modules: AnalyticsModule[],
  ): Promise<Record<string, MatchAnalytics | null>> {
    try {
      await this.haloFilmService.warmAuthCache();
    } catch (error) {
      this.logService.warn(error, new Map([["context", "warmAuthCache pre-warm"]]));
    }

    const settled = await Promise.allSettled(matchIds.map(async (matchId) => this.getMatchAnalytics(matchId, modules)));

    const results: Record<string, MatchAnalytics | null> = {};
    for (const [index, matchId] of matchIds.entries()) {
      const outcome = Preconditions.checkExists(settled[index]);
      results[matchId] = outcome.status === "fulfilled" ? outcome.value : null;
    }
    return results;
  }
}
