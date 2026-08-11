import { vi } from "vitest";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { DatabaseService } from "../../database/database";
import type { HaloService } from "../../halo/halo";
import type { LogService } from "../../log/types";
import { LeaderboardService } from "../leaderboard";

interface LeaderboardServiceDependencies {
  databaseService: DatabaseService;
  haloService: HaloService;
  logService: LogService;
}

export function aFakeLeaderboardServiceWith(opts: Partial<LeaderboardServiceDependencies> = {}): LeaderboardService {
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ databaseService });
  const logService = opts.logService ?? aFakeLogServiceWith();

  const service = new LeaderboardService({ databaseService, haloService, logService });
  vi.spyOn(service, "persistSeriesData").mockResolvedValue(undefined);

  return service;
}
