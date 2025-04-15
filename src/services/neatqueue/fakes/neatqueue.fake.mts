import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { NeatQueueServiceOpts } from "../neatqueue.mjs";
import { NeatQueueService } from "../neatqueue.mjs";

export function aFakeNeatQueueServiceWith(opts: Partial<NeatQueueServiceOpts> = {}): NeatQueueService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith({ env });
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env });
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ databaseService });

  return new NeatQueueService({
    env,
    logService,
    databaseService,
    discordService,
    haloService,
    ...opts,
  });
}
