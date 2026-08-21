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
import type { DatabaseService, MatchKillMatrixReplaceRow } from "../database/database";

export interface AnalyticsServiceOpts {
  databaseService: DatabaseService;
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  logService: LogService;
}

interface GetBatchMatchAnalyticsOpts {
  persistKillMatrix?: boolean;
}

// Escalation excluded: only active-weapon kills score, but film events carry no weapon field
const KILL_RACE_GAME_MODES = new Set([
  GameVariantCategory.MultiplayerSlayer,
  GameVariantCategory.MultiplayerFiesta,
  GameVariantCategory.MultiplayerAttrition,
]);
const FILM_EXTRACTION_MAX_ATTEMPTS = 3;

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Film extraction failed with a non-Error value");
}

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
  private readonly databaseService: DatabaseService;
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;
  private readonly logService: LogService;

  constructor({ databaseService, haloService, haloFilmService, logService }: AnalyticsServiceOpts) {
    this.databaseService = databaseService;
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
    this.logService = logService;
  }

  private async getMatchAnalytics(
    matchId: string,
    modules: AnalyticsModule[],
    opts: GetBatchMatchAnalyticsOpts,
  ): Promise<MatchAnalytics> {
    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    if (opts.persistKillMatrix === true) {
      try {
        await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);
      } catch {
        // Persistence is best-effort in this read path.
      }
    }
    // Sequential on purpose: the kill-matrix pass warms the film metadata/chunk caches that the
    // score-progression pass reads — running them concurrently duplicates the film fetch and
    // inflate work on a cold cache instead of sharing it.
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

  async persistMatchKillMatrix(matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0]): Promise<void> {
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);
  }

  private async buildKillMatrixAnalyticsWithRetries(
    matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0],
  ): Promise<Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>> {
    let lastError: Error = new Error("Film extraction failed");
    for (let attempt = 1; attempt <= FILM_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.haloFilmService.buildKillMatrixAnalytics(matchStats);
      } catch (error) {
        const normalizedError = toError(error);
        lastError = normalizedError;
        this.logService.warn(
          normalizedError,
          new Map([
            ["matchId", matchStats.MatchId],
            ["filmAttempt", attempt.toString()],
          ]),
        );
      }
    }

    throw lastError;
  }

  private async persistKillMatrixEntries(
    matchId: string,
    entries: Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>["entries"],
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const rows: MatchKillMatrixReplaceRow[] = entries
      .filter((entry) => entry.killerXuid.length > 0 && entry.victimXuid.length > 0)
      .map((entry) => ({
        KillerXuid: entry.killerXuid,
        VictimXuid: entry.victimXuid,
        Count: entry.count,
        Perfects: entry.perfects,
        CreatedAt: now,
        UpdatedAt: now,
      }));

    try {
      await this.databaseService.replaceMatchKillMatrix(matchId, rows);
    } catch (error) {
      const normalizedError = toError(error);
      this.logService.warn(
        normalizedError,
        new Map([
          ["matchId", matchId],
          ["context", "persist match kill matrix"],
        ]),
      );
      throw normalizedError;
    }
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
    opts: GetBatchMatchAnalyticsOpts = {},
  ): Promise<Record<string, MatchAnalytics | null>> {
    try {
      await this.haloFilmService.warmAuthCache();
    } catch (error) {
      this.logService.warn(error, new Map([["context", "warmAuthCache pre-warm"]]));
    }

    const settled = await Promise.allSettled(
      matchIds.map(async (matchId) => this.getMatchAnalytics(matchId, modules, opts)),
    );

    const results: Record<string, MatchAnalytics | null> = {};
    for (const [index, matchId] of matchIds.entries()) {
      const outcome = Preconditions.checkExists(settled[index]);
      results[matchId] = outcome.status === "fulfilled" ? outcome.value : null;
    }
    return results;
  }
}
