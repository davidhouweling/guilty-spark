import { authenticate } from "@xboxreplay/xboxlive-auth";
import { DatabaseService } from "./database/database.mjs";
import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";
import { HaloInfiniteClient } from "halo-infinite-api";
import { XstsTokenProvider } from "./halo/xsts-token-provider.mjs";
import { verifyKey } from "discord-interactions";

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
  const discordService = new DiscordService({ env, fetch, verifyKey });
  const xboxService = new XboxService({ env, authenticate });
  const haloService = new HaloService({
    databaseService,
    infiniteClient: new HaloInfiniteClient(new XstsTokenProvider(xboxService)),
  });

  await xboxService.loadCredentials();

  return {
    databaseService,
    discordService,
    xboxService,
    haloService,
  };
}
