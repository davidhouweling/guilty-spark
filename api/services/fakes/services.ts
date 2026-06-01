import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { aFakeDatabaseServiceWith } from "../database/fakes/database.fake";
import { aFakeDiscordServiceWith } from "../discord/fakes/discord.fake";
import { aFakeHaloServiceWith } from "../halo/fakes/halo.fake";
import { aFakeHaloInfiniteClient } from "../halo/fakes/infinite-client.fake";
import { aFakeUserTokenProviderWith } from "../halo/fakes/user-token-provider.fake";
import type { Services } from "../install";
import { aFakeLogServiceWith } from "../log/fakes/log.fake";
import { aFakeNeatQueueServiceWith } from "../neatqueue/fakes/neatqueue.fake";
import { aFakeAuthServiceWith } from "../auth/fakes/auth.fake";
import { aFakeXboxServiceWith } from "../xbox/fakes/xbox.fake";
import { aFakeLiveTrackerServiceWith } from "../live-tracker/fakes/live-tracker.fake";
import { aFakeIndividualTrackerServiceWith } from "../individual-tracker/fakes/individual-tracker.fake";

export function installFakeServicesWith(opts: Partial<Services & { env: Env }> = {}): Services {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith({ env });
  const authService = opts.authService ?? aFakeAuthServiceWith({ ...env, databaseService });
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env });
  const xboxService = opts.xboxService ?? aFakeXboxServiceWith({ env });
  const haloInfiniteClient = opts.haloInfiniteClient ?? aFakeHaloInfiniteClient();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ infiniteClient: haloInfiniteClient, databaseService });
  const userTokenProvider = opts.userTokenProvider ?? aFakeUserTokenProviderWith({ authService, xboxService });
  const liveTrackerService =
    opts.liveTrackerService ?? aFakeLiveTrackerServiceWith({ logService, discordService, env });
  const neatQueueService =
    opts.neatQueueService ??
    aFakeNeatQueueServiceWith({ env, databaseService, discordService, haloService, liveTrackerService });
  const individualTrackerService =
    opts.individualTrackerService ?? aFakeIndividualTrackerServiceWith({ databaseService });

  return {
    logService,
    authService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    haloInfiniteClient,
    userTokenProvider,
    liveTrackerService,
    neatQueueService,
    individualTrackerService,
  };
}
