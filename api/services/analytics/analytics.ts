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
import type { MatchKillMatrixRow } from "../database/types/match_kill_matrix";

export interface AnalyticsServiceOpts {
  databaseService: DatabaseService;
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
const FILM_EXTRACTION_MAX_ATTEMPTS = 3;
const NUMERIC_XUID_REGEX = /^\d+$/;

function getErrorDetail(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(`Non-Error value thrown: ${getErrorDetail(error)}`);
}

function toContractKillMatrix(
  entries: Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>["entries"],
): Record<string, ContractKillMatrixEntry> {
  const killMatrix: Record<string, ContractKillMatrixEntry> = {};
  for (const entry of entries) {
    if (!NUMERIC_XUID_REGEX.test(entry.killerXuid) || !NUMERIC_XUID_REGEX.test(entry.victimXuid)) {
      continue;
    }
    const key = `${entry.killerXuid}:${entry.victimXuid}`;
    killMatrix[key] = {
      count: entry.count,
      perfects: entry.perfects,
    };
  }

  return killMatrix;
}

function toContractKillMatrixFromRows(rows: MatchKillMatrixRow[]): Record<string, ContractKillMatrixEntry> {
  const killMatrix: Record<string, ContractKillMatrixEntry> = {};
  for (const row of rows) {
    if (!NUMERIC_XUID_REGEX.test(row.KillerXuid) || !NUMERIC_XUID_REGEX.test(row.VictimXuid)) {
      continue;
    }
    const key = `${row.KillerXuid}:${row.VictimXuid}`;
    killMatrix[key] = {
      count: row.Count,
      perfects: row.Perfects,
    };
  }

  return killMatrix;
}

function getRowsByMatchId(rows: MatchKillMatrixRow[]): Map<string, MatchKillMatrixRow[]> {
  const rowsByMatchId = new Map<string, MatchKillMatrixRow[]>();
  for (const row of rows) {
    const existingRows = rowsByMatchId.get(row.MatchId) ?? [];
    existingRows.push(row);
    rowsByMatchId.set(row.MatchId, existingRows);
  }

  return rowsByMatchId;
}

function hasMalformedKillMatrixRows(rows: MatchKillMatrixRow[]): boolean {
  return rows.some((row) => !NUMERIC_XUID_REGEX.test(row.KillerXuid) || !NUMERIC_XUID_REGEX.test(row.VictimXuid));
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
    cachedKillMatrix: Record<string, ContractKillMatrixEntry> | null,
  ): Promise<MatchAnalytics> {
    const requestedModules: AnalyticsModule[] = modules.includes("killMatrix") ? modules : ["killMatrix", ...modules];
    if (cachedKillMatrix != null && !modules.includes("scoreProgression")) {
      return {
        requestedModules,
        killMatrix: cachedKillMatrix,
        scoreProgression: null,
      };
    }

    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    const killMatrix = cachedKillMatrix ?? (await this.buildAndPersistKillMatrixAnalytics(matchStats));
    // Sequential on purpose: when kill-matrix extraction runs it warms film metadata/chunk caches
    // that score-progression reads; running both concurrently on a cold cache can duplicate film
    // fetch work instead of sharing it.
    const scoreProgression = modules.includes("scoreProgression")
      ? await this.buildScoreProgressionAnalytics(matchStats)
      : null;

    return {
      requestedModules,
      killMatrix,
      scoreProgression,
    };
  }

  async persistMatchKillMatrix(matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0]): Promise<void> {
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);
  }

  private async buildAndPersistKillMatrixAnalytics(
    matchStats: Parameters<HaloFilmService["buildKillMatrixAnalytics"]>[0],
  ): Promise<Record<string, ContractKillMatrixEntry>> {
    const killMatrixAnalytics = await this.buildKillMatrixAnalyticsWithRetries(matchStats);
    try {
      await this.persistKillMatrixEntries(matchStats.MatchId, killMatrixAnalytics.entries);
    } catch (error) {
      this.logService.warn(
        toError(error),
        new Map([
          ["matchId", matchStats.MatchId],
          ["context", "best-effort kill matrix persistence"],
        ]),
      );
    }

    return toContractKillMatrix(killMatrixAnalytics.entries);
  }

  private async getCachedKillMatrices(
    matchIds: string[],
  ): Promise<Map<string, Record<string, ContractKillMatrixEntry> | null>> {
    const cachedKillMatrices = new Map<string, Record<string, ContractKillMatrixEntry> | null>();
    for (const matchId of matchIds) {
      cachedKillMatrices.set(matchId, null);
    }

    try {
      const rows = await this.databaseService.getMatchKillMatrices(matchIds);
      const rowsByMatchId = getRowsByMatchId(rows);
      for (const matchId of matchIds) {
        const rowsForMatch = rowsByMatchId.get(matchId) ?? [];
        if (rowsForMatch.length > 0) {
          if (hasMalformedKillMatrixRows(rowsForMatch)) {
            continue;
          }
          const killMatrix = toContractKillMatrixFromRows(rowsForMatch);
          if (Object.keys(killMatrix).length > 0) {
            cachedKillMatrices.set(matchId, killMatrix);
          }
        }
      }
    } catch (error) {
      this.logService.warn(
        toError(error),
        new Map([
          ["context", "read cached kill matrices"],
          ["matchIdCount", matchIds.length.toString()],
        ]),
      );
    }

    return cachedKillMatrices;
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
            ["context", "build kill matrix analytics"],
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
      .filter((entry) => NUMERIC_XUID_REGEX.test(entry.killerXuid) && NUMERIC_XUID_REGEX.test(entry.victimXuid))
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
  ): Promise<Record<string, MatchAnalytics | null>> {
    const includesScoreProgression = modules.includes("scoreProgression");
    const cachedKillMatrices = await this.getCachedKillMatrices(matchIds);
    const needsFilmAccess =
      includesScoreProgression || matchIds.some((matchId) => cachedKillMatrices.get(matchId) == null);
    if (needsFilmAccess) {
      try {
        await this.haloFilmService.warmAuthCache();
      } catch (error) {
        this.logService.warn(error, new Map([["context", "warmAuthCache pre-warm"]]));
      }
    }

    const settled = await Promise.allSettled(
      matchIds.map(async (matchId) =>
        this.getMatchAnalytics(matchId, modules, cachedKillMatrices.get(matchId) ?? null),
      ),
    );

    const results: Record<string, MatchAnalytics | null> = {};
    for (const [index, matchId] of matchIds.entries()) {
      const outcome = Preconditions.checkExists(settled[index]);
      results[matchId] = outcome.status === "fulfilled" ? outcome.value : null;
    }
    return results;
  }
}
