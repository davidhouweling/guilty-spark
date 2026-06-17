import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";

export function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 3,
        headshotKills: 1,
        perfects: 0,
        weapons: [],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 0, byXuid: {} },
    },
    ...overrides,
  };
}

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const haloFilmService = opts.haloFilmService ?? aFakeHaloFilmServiceWith();

  return new AnalyticsService({ haloService, haloFilmService });
}
