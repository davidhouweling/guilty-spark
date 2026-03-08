import { LiveTrackerService } from "../live-tracker.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

interface LiveTrackerServiceDependencies {
  logService: LogService;
  discordService: DiscordService;
  haloService: HaloService;
  env: Env;
}

export function aFakeLiveTrackerServiceWith(opts: Partial<LiveTrackerServiceDependencies> = {}): LiveTrackerService {
  const logService = opts.logService ?? aFakeLogServiceWith();
  const discordService = opts.discordService ?? aFakeDiscordServiceWith({ env: aFakeEnvWith() });
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const env = opts.env ?? aFakeEnvWith();

  return new LiveTrackerService({ logService, discordService, haloService, env });
}
