import { authenticate } from "@xboxreplay/xboxlive-auth";
import { HaloInfiniteClient, type SpartanTokenProvider } from "halo-infinite-api";
import { verifyKey } from "discord-interactions";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { DatabaseService } from "./database/database";
import { DiscordService } from "./discord/discord";
import { HaloService } from "./halo/halo";
import { XboxService } from "./xbox/xbox";
import { CustomSpartanTokenProvider } from "./halo/custom-spartan-token-provider";
import { UserTokenProvider } from "./halo/user-token-provider";
import { NeatQueueService } from "./neatqueue/neatqueue";
import { LiveTrackerService } from "./live-tracker/live-tracker";
import { AuthService } from "./auth/auth";
import { MicrosoftAuthService } from "./auth/microsoft-auth";
import { IndividualTrackerService } from "./individual-tracker/individual-tracker";
import type { LogService } from "./log/types";
import { AggregatorClient } from "./log/aggregator-client";
import { ConsoleLogClient } from "./log/console-log-client";
import { SentryLogClient } from "./log/sentry-log-client";
import { createResilientFetch } from "./halo/resilient-fetch";
import { PlayerMatchesRateLimiter } from "./halo/player-matches-rate-limiter";

export interface Services {
  logService: LogService;
  authService: AuthService;
  databaseService: DatabaseService;
  discordService: DiscordService;
  xboxService: XboxService;
  haloService: HaloService;
  haloInfiniteClient: HaloInfiniteClient;
  liveTrackerService: LiveTrackerService;
  neatQueueService: NeatQueueService;
  individualTrackerService: IndividualTrackerService;
}

interface InstallServicesOpts {
  env: Env;
  userTokens?: {
    accessToken: string;
    refreshToken?: string;
  };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function installServices({ env, userTokens }: InstallServicesOpts): Services {
  const sentryMode = env.MODE === "development" ? "development" : "production";
  const logService = new AggregatorClient([new SentryLogClient(sentryMode), new ConsoleLogClient()]);
  const microsoftAuthService = new MicrosoftAuthService({
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    redirectUri: env.MICROSOFT_REDIRECT_URI,
  });
  const authService = new AuthService({
    microsoftAuthService,
    sessionSecret: env.SESSION_SECRET,
    pkceStore: env.APP_DATA,
  });
  const databaseService = new DatabaseService({ env });
  const discordService = new DiscordService({ env, logService, fetch, verifyKey });
  const xboxService = new XboxService({ env, authenticate });
  const useProxy: boolean = env.MODE === "development" && isValidUrl(env.PROXY_WORKER_URL);

  // Create Spartan token provider: user-scoped if tokens provided, otherwise bot account
  const spartanTokenProvider: SpartanTokenProvider = userTokens
    ? new UserTokenProvider({
        userMicrosoftAccessToken: userTokens.accessToken,
        userMicrosoftRefreshToken: userTokens.refreshToken,
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        redirectUri: env.MICROSOFT_REDIRECT_URI,
        logService,
      })
    : new CustomSpartanTokenProvider({ env, xboxService });

  // For development with JSON-RPC proxy, use the existing proxy implementation
  // Otherwise, use direct client with resilient fetch wrapper
  const haloInfiniteClient: HaloInfiniteClient = useProxy
    ? createHaloInfiniteClientProxy({
        proxyBaseUrl: env.PROXY_WORKER_URL,
        authToken: env.PROXY_WORKER_TOKEN,
      })
    : new HaloInfiniteClient(
        spartanTokenProvider,
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
  const liveTrackerService = new LiveTrackerService({ env, logService, discordService });
  const neatQueueService = new NeatQueueService({
    env,
    logService,
    databaseService,
    discordService,
    haloService,
    liveTrackerService,
  });
  const individualTrackerService = new IndividualTrackerService(databaseService);

  return {
    logService,
    authService,
    databaseService,
    discordService,
    xboxService,
    haloService,
    haloInfiniteClient,
    liveTrackerService,
    neatQueueService,
    individualTrackerService,
  };
}
