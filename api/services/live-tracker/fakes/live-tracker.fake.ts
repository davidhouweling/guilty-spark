import { LiveTrackerService } from "../live-tracker";
import type { LogService } from "../../log/types";
import type { DiscordService } from "../../discord/discord";
import type { HaloService } from "../../halo/halo";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";

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
