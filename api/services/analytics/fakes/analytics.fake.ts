import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";

export function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 3,
        perfects: 0,
      },
    },
    scoreProgression: null,
    ...overrides,
  };
}

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const haloFilmService = opts.haloFilmService ?? aFakeHaloFilmServiceWith();
  const logService = opts.logService ?? aFakeLogServiceWith();

  return new AnalyticsService({
    databaseService,
    haloService,
    haloFilmService,
    logService,
  });
}
