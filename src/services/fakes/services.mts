import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";
import { aFakeDatabaseServiceWith } from "../database/fakes/database.fake.mjs";
import { aFakeDiscordServiceWith } from "../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../halo/fakes/halo.fake.mjs";
import type { Services } from "../install.mjs";
import { aFakeNeatQueueServiceWith } from "../neatqueue/fakes/neatqueue.fake.mjs";
import { aFakeXboxServiceWith } from "../xbox/fakes/xbox.fake.mjs";

export function installFakeServicesWith(opts: Partial<Services & { env: Env }> = {}): Services {
  const env = opts.env ?? aFakeEnvWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith({ env });
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env });
  const xboxService = opts.xboxService ?? aFakeXboxServiceWith({ env });
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ databaseService });
  const neatQueueService =
    opts.neatQueueService ?? aFakeNeatQueueServiceWith({ env, databaseService, discordService, haloService });

  return {
    databaseService,
    discordService,
    xboxService,
    haloService,
    neatQueueService,
  };
}
