import { authenticate } from "@xboxreplay/xboxlive-auth";
import { HaloInfiniteClient } from "halo-infinite-api";
import { verifyKey } from "discord-interactions";
import { DatabaseService } from "./database/database";
import { DiscordService } from "./discord/discord";
import { HaloService } from "./halo/halo";
import { XboxService } from "./xbox/xbox";
import { CustomSpartanTokenProvider } from "./halo/custom-spartan-token-provider";
import { NeatQueueService } from "./neatqueue/neatqueue";
import { LiveTrackerService } from "./live-tracker/live-tracker";
import { AuthService } from "./auth/auth";
import { IndividualTrackerService } from "./individual-tracker/individual-tracker";
import type { LogService } from "./log/types";
import { AggregatorClient } from "./log/aggregator-client";
import { ConsoleLogClient } from "./log/console-log-client";
import { SentryLogClient } from "./log/sentry-log-client";
import { createHaloInfiniteClientProxy } from "./halo/halo-infinite-client-proxy";
import { createResilientFetch } from "./halo/resilient-fetch";
import { PlayerMatchesRateLimiter } from "./halo/player-matches-rate-limiter";
import { UserTokenProvider } from "./halo/user-token-provider";
import { AnalyticsService } from "./analytics/analytics";
import { HaloFilmService } from "./halo/halo-film";

export interface Services {
  logService: LogService;
  authService: AuthService;
  databaseService: DatabaseService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  haloInfiniteClient: HaloInfiniteClient;
  userTokenProvider: UserTokenProvider;
  analyticsService: AnalyticsService;
  liveTrackerService: LiveTrackerService;
  neatQueueService: NeatQueueService;
  individualTrackerService: IndividualTrackerService;
}

interface InstallServicesOpts {
  env: Env;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function installServices({ env }: InstallServicesOpts): Services {
  const sentryMode = env.MODE === "development" ? "development" : "production";
  const logService = new AggregatorClient([new SentryLogClient(sentryMode), new ConsoleLogClient()]);
  const databaseService = new DatabaseService({ env });
  const authService = new AuthService({
    microsoftClientId: env.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: env.MICROSOFT_CLIENT_SECRET,
    microsoftTenant: env.MICROSOFT_TENANT,
    microsoftRedirectUri: env.MICROSOFT_REDIRECT_URI,
    microsoftScopes: env.MICROSOFT_SCOPES,
    sessionSecret: env.SESSION_SECRET,
    tokenEncryptionSecret: env.TOKEN_ENCRYPTION_SECRET,
    databaseService,
  });
  const discordService = new DiscordService({ env, logService, fetch, verifyKey });
  const xboxService = new XboxService({ env, authenticate });
  const useProxy: boolean = env.MODE === "development" && isValidUrl(env.PROXY_WORKER_URL);

  // For development with JSON-RPC proxy, use the existing proxy implementation
  // Otherwise, use direct client with resilient fetch wrapper
  const haloInfiniteClient: HaloInfiniteClient = useProxy
    ? createHaloInfiniteClientProxy({ env })
    : new HaloInfiniteClient(
        new CustomSpartanTokenProvider({ env, xboxService }),
        createResilientFetch({
          env,
          logService,
          proxyUrl: env.PROXY_WORKER_URL,
        }),
      );

  const haloService = new HaloService({
    env,
    logService,
    databaseService,
    xboxService,
    infiniteClient: haloInfiniteClient,
    playerMatchesRateLimiter: new PlayerMatchesRateLimiter({ logService, maxCallsPerSecond: 2 }),
  });
  const userTokenProvider = new UserTokenProvider({ authService, xboxService, logService });
  const haloFilmService = new HaloFilmService({
    env,
    spartanTokenProvider: new CustomSpartanTokenProvider({ env, xboxService }),
  });
  const analyticsService = new AnalyticsService({ haloService, haloFilmService });
  const liveTrackerService = new LiveTrackerService({ env, logService, discordService });
  const individualTrackerService = new IndividualTrackerService({ env, logService, databaseService });
  const neatQueueService = new NeatQueueService({
    env,
    logService,
    databaseService,
    discordService,
    haloService,
    liveTrackerService,
    individualTrackerService,
  });

  return {
    logService,
    authService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    haloFilmService,
    haloInfiniteClient,
    userTokenProvider,
    analyticsService,
    liveTrackerService,
    neatQueueService,
    individualTrackerService,
  };
}
