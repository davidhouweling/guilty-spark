import { authenticate } from "@xboxreplay/xboxlive-auth";
import { HaloInfiniteClient } from "halo-infinite-api";
import { verifyKey } from "discord-interactions";
import { DatabaseService } from "./database/database.mjs";
import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";
import { XstsTokenProvider } from "./halo/xsts-token-provider.mjs";
import { NeatQueueService } from "./neatqueue/neatqueue.mjs";
import type { LogService } from "./log/types.mjs";
import { AggregatorClient } from "./log/aggregator-client.mjs";
import { ConsoleLogClient } from "./log/console-log-client.mjs";
import { SentryLogClient } from "./log/sentry-log-client.mjs";

export interface Services {
  logService: LogService;
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
  const logService = new AggregatorClient(
    env.MODE === "production" ? [new SentryLogClient(), new ConsoleLogClient()] : [new ConsoleLogClient()],
  );
  const databaseService = new DatabaseService({ env });
  const discordService = new DiscordService({ env, logService, fetch, verifyKey });
  const xboxService = new XboxService({ env, logService, authenticate });
  const haloService = new HaloService({
    logService,
    databaseService,
    infiniteClient: new HaloInfiniteClient(new XstsTokenProvider(xboxService)),
  });
  const neatQueueService = new NeatQueueService({ env, logService, databaseService, discordService, haloService });

  await xboxService.loadCredentials();

  return {
    logService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    neatQueueService,
  };
}
