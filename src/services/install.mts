import { DatabaseService } from "./database/database.mjs";
import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";

export interface Services {
  databaseService: DatabaseService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
}

interface InstallServicesOpts {
  env: Env;
}

export async function installServices({ env }: InstallServicesOpts): Promise<Services> {
  const databaseService = new DatabaseService({ env });
  const discordService = new DiscordService({ env });
  const xboxService = new XboxService({ env });
  const haloService = new HaloService({ databaseService, xboxService });

  await xboxService.loadCredentials();

  return {
    databaseService,
    discordService,
    xboxService,
    haloService,
  };
}
