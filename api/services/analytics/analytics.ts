import {
  SUPPORTED_ANALYTICS_MODULES,
  type AnalyticsModule,
  type MatchAnalytics,
  type KillMatrixEntry as ContractKillMatrixEntry,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloService } from "../halo/halo";
import { HaloFilmService } from "../halo/halo-film";
import { CustomSpartanTokenProvider } from "../halo/custom-spartan-token-provider";
import type { LogService } from "../log/types";
import { XboxService } from "../xbox/xbox";
import { authenticate } from "@xboxreplay/xboxlive-auth";

export interface AnalyticsService {
  getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics>;
}

const supportedAnalyticsModuleSet = new Set<string>(SUPPORTED_ANALYTICS_MODULES);

function isSupportedAnalyticsModule(module: string): module is AnalyticsModule {
  return supportedAnalyticsModuleSet.has(module);
}

function toContractKillMatrix(entries: Awaited<ReturnType<HaloFilmService["buildKillMatrixAnalytics"]>>["entries"]): Record<string, ContractKillMatrixEntry> {
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

export function createAnalyticsService(env: Env, haloService: HaloService, _logService: LogService): AnalyticsService {
  return {
    async getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics> {
      const requestedModules = modules.filter(isSupportedAnalyticsModule);
      if (requestedModules.length === 0) {
        return Promise.reject(new Error("No supported analytics modules requested"));
      }

      const matchStats = Preconditions.checkExists((await haloService.getMatchDetails([matchId]))[0]);
      const xboxService = new XboxService({ env, authenticate });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const haloFilmService = new HaloFilmService({ env, spartanTokenProvider });
      const killMatrixAnalytics = await haloFilmService.buildKillMatrixAnalytics(matchStats);

      return {
        requestedModules,
        killMatrix: toContractKillMatrix(killMatrixAnalytics.entries),
        metadata: {
          pairingQuality: killMatrixAnalytics.pairingQuality,
          perfectCounts: killMatrixAnalytics.perfectCounts,
        },
      };
    },
  };
}
