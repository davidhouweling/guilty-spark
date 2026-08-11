import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeLiveTrackerServiceWith } from "../../live-tracker/fakes/live-tracker.fake";
import { aFakeIndividualTrackerServiceWith } from "../../individual-tracker/fakes/individual-tracker.fake";
import { LeaderboardService } from "../../leaderboard/leaderboard";
import type { NeatQueueServiceOpts } from "../neatqueue";
import { NeatQueueService } from "../neatqueue";

export function aFakeNeatQueueServiceWith(opts: Partial<NeatQueueServiceOpts> = {}): NeatQueueService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith({ env });
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env });
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ databaseService });
  const leaderboardService =
    opts.leaderboardService ?? new LeaderboardService({ databaseService, haloService, logService });
  const liveTrackerService =
    opts.liveTrackerService ?? aFakeLiveTrackerServiceWith({ logService, discordService, env });
  const individualTrackerService = opts.individualTrackerService ?? aFakeIndividualTrackerServiceWith();

  return new NeatQueueService({
    env,
    logService,
    databaseService,
    discordService,
    haloService,
    leaderboardService,
    liveTrackerService,
    individualTrackerService,
  });
}
