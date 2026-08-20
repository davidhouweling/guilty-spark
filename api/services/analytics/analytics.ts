import { GameVariantCategory } from "halo-infinite-api";
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
import type { DatabaseService } from "../database/database";
import type { MatchKillMatrixRow } from "../database/types/match_kill_matrix";

export interface AnalyticsServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  logService: LogService;
  databaseService?: DatabaseService;
}

// Escalation excluded: only active-weapon kills score, but film events carry no weapon field
const KILL_RACE_GAME_MODES = new Set([
  GameVariantCategory.MultiplayerSlayer,
  GameVariantCategory.MultiplayerFiesta,
  GameVariantCategory.MultiplayerAttrition,
]);
const FILM_EXTRACTION_MAX_ATTEMPTS = 3;

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
  private readonly databaseService: DatabaseService | undefined;

  constructor({ haloService, haloFilmService, logService, databaseService }: AnalyticsServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
    this.logService = logService;
    this.databaseService = databaseService;
  }

  private async getMatchAnalytics(matchId: string, modules: AnalyticsModule[]): Promise<MatchAnalytics> {
    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);

    let scoreProgression: MatchAnalytics["scoreProgression"] = null;
    if (modules.includes("scoreProgression")) {
      const mode = matchStats.MatchInfo.GameVariantCategory;
      if (KILL_RACE_GAME_MODES.has(mode) && matchStats.Teams.length > 0) {
        const progression = await this.haloFilmService.buildKillRaceProgression(matchStats);
        scoreProgression = {
          mode,
          durationMs: Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000),
          teamCount: progression.teamCount,
          respawnDurationMs: KILL_RACE_RESPAWN_DURATION_MS[mode] ?? null,
          timeline: { type: "kill-race", events: progression.events, deathTimeline: progression.deathTimeline },
        };
      }
    }

    const requestedModules: AnalyticsModule[] = modules.includes("killMatrix") ? modules : ["killMatrix", ...modules];

    return {
      requestedModules,
      killMatrix: toContractKillMatrix(killMatrixAnalytics.entries),
      metadata: {
        pairingQuality: killMatrixAnalytics.pairingQuality,
        perfectCounts: killMatrixAnalytics.perfectCounts,
      },
      scoreProgression,
    };
  }

  async persistMatchKillMatrix(matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0]): Promise<void> {
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);
  }

  private async buildKillMatrixAnalyticsWithRetries(
    matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0],
  ): Promise<Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>> {
    let lastError: unknown = new Error("Film extraction failed");
    for (let attempt = 1; attempt <= FILM_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.haloFilmService.buildKillMatrixAnalytics(matchStats);
      } catch (error) {
        lastError = error;
        this.logService.warn(
          error,
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
    if (this.databaseService == null) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const rows: MatchKillMatrixRow[] = entries
      .filter((entry) => entry.killerXuid.length > 0 && entry.victimXuid.length > 0)
      .map((entry) => ({
        MatchId: matchId,
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
      this.logService.warn(
        error,
        new Map([
          ["matchId", matchId],
          ["context", "persist match kill matrix"],
        ]),
      );
    }
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
