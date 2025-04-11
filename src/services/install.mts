import { authenticate } from "@xboxreplay/xboxlive-auth";
import { HaloInfiniteClient } from "halo-infinite-api";
import { verifyKey } from "discord-interactions";
import { DatabaseService } from "./database/database.mjs";
import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";
import { XstsTokenProvider } from "./halo/xsts-token-provider.mjs";
import { NeatQueueService } from "./neatqueue/neatqueue.mjs";

export interface Services {
  databaseService: DatabaseService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
  neatQueueService: NeatQueueService;
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
  const neatQueueService = new NeatQueueService({ env, databaseService, discordService, haloService });

  await xboxService.loadCredentials();

  return {
    databaseService,
    discordService,
    xboxService,
    haloService,
    neatQueueService,
  };
}
