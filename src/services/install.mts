import { authenticate } from "@xboxreplay/xboxlive-auth";
import { HaloInfiniteClient } from "halo-infinite-api";
import { verifyKey } from "discord-interactions";
import { DatabaseService } from "./database/database.mjs";
import { DiscordService } from "./discord/discord.mjs";
import { HaloService } from "./halo/halo.mjs";
import { XboxService } from "./xbox/xbox.mjs";
import { CustomSpartanTokenProvider } from "./halo/custom-spartan-token-provider.mjs";
import { NeatQueueService } from "./neatqueue/neatqueue.mjs";
import type { LogService } from "./log/types.mjs";
import { AggregatorClient } from "./log/aggregator-client.mjs";
import { ConsoleLogClient } from "./log/console-log-client.mjs";
import { SentryLogClient } from "./log/sentry-log-client.mjs";
import { createHaloInfiniteClientProxy } from "./halo/halo-infinite-client-proxy.mjs";

export interface Services {
  logService: LogService;
  databaseService: DatabaseService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
  haloInfiniteClient: HaloInfiniteClient;
  neatQueueService: NeatQueueService;
}

interface InstallServicesOpts {
  env: Env;
}

export function installServices({ env }: InstallServicesOpts): Services {
  const logService = new AggregatorClient(
    env.MODE === "production" ? [new SentryLogClient(), new ConsoleLogClient()] : [new ConsoleLogClient()],
  );
  const databaseService = new DatabaseService({ env });
  const discordService = new DiscordService({ env, logService, fetch, verifyKey });
  const xboxService = new XboxService({ env, authenticate });
  const useProxy: boolean = typeof env.PROXY_WORKER_URL === "string" && env.PROXY_WORKER_URL.length > 0;

  const haloInfiniteClient: HaloInfiniteClient = useProxy
    ? createHaloInfiniteClientProxy()
    : new HaloInfiniteClient(new CustomSpartanTokenProvider({ env, xboxService }));

  const haloService = new HaloService({
    logService,
    databaseService,
    infiniteClient: haloInfiniteClient,
  });
  const neatQueueService = new NeatQueueService({ env, logService, databaseService, discordService, haloService });

  return {
    logService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    haloInfiniteClient,
    neatQueueService,
  };
}
