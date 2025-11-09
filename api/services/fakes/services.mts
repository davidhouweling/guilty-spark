import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";
import { aFakeDatabaseServiceWith } from "../database/fakes/database.fake.mjs";
import { aFakeDiscordServiceWith } from "../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../halo/fakes/halo.fake.mjs";
import { aFakeHaloInfiniteClient } from "../halo/fakes/infinite-client.fake.mjs";
import type { Services } from "../install.mjs";
import { aFakeLogServiceWith } from "../log/fakes/log.fake.mjs";
import { aFakeNeatQueueServiceWith } from "../neatqueue/fakes/neatqueue.fake.mjs";
import { aFakeXboxServiceWith } from "../xbox/fakes/xbox.fake.mjs";
import { aFakeLiveTrackerServiceWith } from "../live-tracker/fakes/live-tracker.fake.mjs";

export function installFakeServicesWith(opts: Partial<Services & { env: Env }> = {}): Services {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith({ env });
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env });
  const xboxService = opts.xboxService ?? aFakeXboxServiceWith({ env });
  const haloInfiniteClient = opts.haloInfiniteClient ?? aFakeHaloInfiniteClient();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ infiniteClient: haloInfiniteClient, databaseService });
  const liveTrackerService =
    opts.liveTrackerService ?? aFakeLiveTrackerServiceWith({ logService, discordService, env });
  const neatQueueService =
    opts.neatQueueService ??
    aFakeNeatQueueServiceWith({ env, databaseService, discordService, haloService, liveTrackerService });

  return {
    logService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    haloInfiniteClient,
    liveTrackerService,
    neatQueueService,
  };
}
