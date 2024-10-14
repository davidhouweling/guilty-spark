import { DiscordService } from "./discord/discord.mjs";
import { XboxService } from "./xbox/xbox.mjs";

export interface Services {
  discordService: DiscordService;
  xboxService: XboxService;
}

export function installServices(): Services {
  const discordService = new DiscordService();
  const xboxService = new XboxService();

  return {
    discordService,
    xboxService,
  };
}
