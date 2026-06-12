import {
  SUPPORTED_ANALYTICS_MODULES,
  type AnalyticsModule,
  type MatchAnalytics,
  type KillMatrixEntry as ContractKillMatrixEntry,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import type { HaloService } from "../halo/halo";
import { HaloFilmService } from "../halo/halo-film";
import { CustomSpartanTokenProvider } from "../halo/custom-spartan-token-provider";
import { XboxService } from "../xbox/xbox";

export interface AnalyticsServiceOpts {
  env: Env;
  haloService: HaloService;
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
  private readonly env: Env;
  private readonly haloService: HaloService;

  constructor({ env, haloService }: AnalyticsServiceOpts) {
    this.env = env;
    this.haloService = haloService;
  }

  async getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics> {
    const requestedModules = modules.filter(isSupportedAnalyticsModule);
    if (requestedModules.length === 0) {
      return Promise.reject(new Error("No supported analytics modules requested"));
    }

    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    const xboxService = new XboxService({ env: this.env, authenticate });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env: this.env, xboxService });
    const haloFilmService = new HaloFilmService({ env: this.env, spartanTokenProvider });
    const killMatrixAnalytics = await haloFilmService.buildKillMatrixAnalytics(matchStats);

    return {
      requestedModules,
      killMatrix: toContractKillMatrix(killMatrixAnalytics.entries),
      metadata: {
        pairingQuality: killMatrixAnalytics.pairingQuality,
        perfectCounts: killMatrixAnalytics.perfectCounts,
      },
    };
  }
}
