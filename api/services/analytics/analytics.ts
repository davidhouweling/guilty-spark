import {
  SUPPORTED_ANALYTICS_MODULES,
  type AnalyticsModule,
  type MatchAnalytics,
  type KillMatrixEntry as ContractKillMatrixEntry,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloService } from "../halo/halo";
import type { HaloFilmService } from "../halo/halo-film";

export interface AnalyticsServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
}

const supportedAnalyticsModuleSet = new Set<string>(SUPPORTED_ANALYTICS_MODULES);

function isSupportedAnalyticsModule(module: string): module is AnalyticsModule {
  return supportedAnalyticsModuleSet.has(module);
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
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;

  constructor({ haloService, haloFilmService }: AnalyticsServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
  }

  async getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics> {
    const requestedModules = modules.filter(isSupportedAnalyticsModule);
    if (requestedModules.length === 0) {
      return Promise.reject(new Error("No supported analytics modules requested"));
    }

    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    const killMatrixAnalytics = await this.haloFilmService.buildKillMatrixAnalytics(matchStats);

    return {
      requestedModules,
      killMatrix: toContractKillMatrix(killMatrixAnalytics.entries),
      metadata: {
        pairingQuality: killMatrixAnalytics.pairingQuality,
        perfectCounts: killMatrixAnalytics.perfectCounts,
      },
    };
  }

  async getBatchMatchAnalytics(matchIds: string[], modules: string[]): Promise<Record<string, MatchAnalytics | null>> {
    try {
      await this.haloFilmService.resolveAuthContext();
    } catch {
      // pre-warm failed; per-match calls will handle auth individually
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
