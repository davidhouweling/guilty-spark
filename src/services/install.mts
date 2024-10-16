import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";

export interface Services {
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
}

export function installServices(): Services {
  const discordService = new DiscordService();
  const xboxService = new XboxService();
  const haloService = new HaloService({ xboxService });

  return {
    discordService,
    xboxService,
    haloService,
  };
}
