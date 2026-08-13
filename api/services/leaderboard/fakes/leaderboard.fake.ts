import { vi } from "vitest";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { DatabaseService } from "../../database/database";
import type { HaloService } from "../../halo/halo";
import type { DiscordService } from "../../discord/discord";
import type { LogService } from "../../log/types";
import { LeaderboardService } from "../leaderboard";

interface LeaderboardServiceDependencies {
  databaseService: DatabaseService;
  discordService: DiscordService;
  haloService: HaloService;
  logService: LogService;
}

export function aFakeLeaderboardServiceWith(opts: Partial<LeaderboardServiceDependencies> = {}): LeaderboardService {
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();
  const discordService = opts.discordService ?? aFakeDiscordServiceWith();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ databaseService });
  const logService = opts.logService ?? aFakeLogServiceWith();

  const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
  vi.spyOn(service, "persistSeriesData").mockResolvedValue(undefined);

  return service;
}
