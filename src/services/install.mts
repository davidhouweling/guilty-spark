import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";

export interface Services {
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
}

interface InstallServicesOpts {
  env: Env;
}

export function installServices({ env }: InstallServicesOpts): Services {
  const discordService = new DiscordService({ env });
  const xboxService = new XboxService({ env });
  const haloService = new HaloService({ xboxService });

  return {
    discordService,
    xboxService,
    haloService,
  };
}
