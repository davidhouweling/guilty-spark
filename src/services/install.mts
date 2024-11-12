import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { KvService } from "./kv/kv.mjs";
import { XboxService } from "./xbox/xbox.mjs";

export interface Services {
  kvService: KvService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
}

interface InstallServicesOpts {
  env: Env;
}

export function installServices({ env }: InstallServicesOpts): Services {
  const kvService = new KvService({ env });
  const discordService = new DiscordService({ env });
  const xboxService = new XboxService({ env, kvService });
  const haloService = new HaloService({ xboxService });

  return {
    kvService,
    discordService,
    xboxService,
    haloService,
  };
}
