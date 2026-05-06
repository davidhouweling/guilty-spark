import type { AutoRouterType } from "itty-router";
import { AutoTokenProvider, HaloInfiniteClient } from "halo-infinite-api";
import type { SpartanTokenProvider } from "halo-infinite-api";
import { isRecord } from "@guilty-spark/shared/base/json-readers";
import type {
  StreamerViewColorMode,
  StreamerViewEffectiveDefaults,
  StreamerViewFontSizes,
  StreamerViewLayoutOptions,
  StreamerViewObserverColorOverrides,
  StreamerViewStyleFlags,
  StreamerViewVisibleSections,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { UserTokenProvider } from "./services/halo/user-token-provider";
import type { installServices } from "./services/install";
import type { getCommands } from "./commands/commands";
import type { AuthSession, SessionTokenPayload } from "./services/auth/types";
import { handleCorsPreflightRequest } from "./base/cors";
import { ProfileNotFoundError, InvalidReorderError } from "./services/individual-tracker/errors";
import { DEFAULT_IDLE_TIMEOUT_HOURS, IDLE_TIMEOUT_HOURS } from "./durable-objects/individual-tracker/types";
import type {
  IdleTimeoutHours,
  IndividualTrackerGamesSyncRequest,
  IndividualTrackerMatchSummary,
  IndividualTrackerStartRequest,
} from "./durable-objects/individual-tracker/types";
import type { IdentityProvider, LinkedIdentitiesRow } from "./services/database/types/linked_identities";
import type { StreamerViewSettingsRow } from "./services/database/types/streamer_view_settings";

interface ServerOpts {
  router: AutoRouterType;
  installServices: typeof installServices;
  getCommands: typeof getCommands;
}

interface LinkIdentityRequest {
  readonly provider: IdentityProvider;
  readonly providerUserId: string;
  readonly gamertag?: string;
  readonly twitchId?: string;
}

interface UnlinkIdentityRequest {
  readonly identityId: string;
}

interface StreamerViewSettingsResponse {
  readonly profileId: string;
  readonly layoutOptions: StreamerViewLayoutOptions;
  readonly visibleSections: StreamerViewVisibleSections;
  readonly styleFlags: StreamerViewStyleFlags;
  readonly effectiveDefaults: StreamerViewEffectiveDefaults;
  readonly updatedAt: number | null;
}

type AuthenticatedRouteSessionResult =
  | {
      readonly isAuthenticated: false;
      readonly response: Response;
    }
  | {
      readonly isAuthenticated: true;
      readonly session: AuthSession;
      readonly refreshedSessionPayload: SessionTokenPayload | null;
    };

function isIdentityProvider(value: unknown): value is IdentityProvider {
  return value === "xbox" || value === "discord" || value === "twitch";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isIndividualTrackerMatchSummary(value: unknown): value is IndividualTrackerMatchSummary {
  return (
    isRecord(value) &&
    typeof value["matchId"] === "string" &&
    typeof value["startTime"] === "string" &&
    typeof value["endTime"] === "string" &&
    typeof value["mapAssetId"] === "string" &&
    typeof value["modeAssetId"] === "string"
  );
}

function mapIdentityResponse(row: LinkedIdentitiesRow): {
  identityId: string;
  userId: string;
  provider: IdentityProvider;
  providerUserId: string;
  gamertag: string | null;
  twitchId: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
} {
  return {
    identityId: row.IdentityId,
    userId: row.UserId,
    provider: row.Provider,
    providerUserId: row.ProviderUserId,
    gamertag: row.Gamertag,
    twitchId: row.TwitchId,
    isActive: row.IsActive === 1,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

function toObjectOrDefault(value: string | null, fallback: Record<string, unknown>): Record<string, unknown> {
  if (value == null || value === "") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function getDefaultStreamerColorMode(trackedXuid: string | null, viewerXuid: string | null): StreamerViewColorMode {
  if (trackedXuid != null && viewerXuid != null && trackedXuid === viewerXuid) {
    return "player";
  }

  return "observer";
}

function toFontSizes(value: unknown): StreamerViewFontSizes | null {
  if (!isRecord(value)) {
    return null;
  }

  const queueInfo = typeof value["queueInfo"] === "number" ? value["queueInfo"] : null;
  const score = typeof value["score"] === "number" ? value["score"] : null;
  const teams = typeof value["teams"] === "number" ? value["teams"] : null;
  const ticker = typeof value["ticker"] === "number" ? value["ticker"] : null;
  const tabs = typeof value["tabs"] === "number" ? value["tabs"] : null;

  const fontSizes: StreamerViewFontSizes = {
    ...(queueInfo == null ? {} : { queueInfo }),
    ...(score == null ? {} : { score }),
    ...(teams == null ? {} : { teams }),
    ...(ticker == null ? {} : { ticker }),
    ...(tabs == null ? {} : { tabs }),
  };

  return Object.keys(fontSizes).length === 0 ? null : fontSizes;
}

function toLayoutOptions(value: string | null): StreamerViewLayoutOptions {
  const record = toObjectOrDefault(value, {});
  const viewMode =
    record["viewMode"] === "standard" || record["viewMode"] === "wide" || record["viewMode"] === "streamer"
      ? record["viewMode"]
      : null;
  const defaultColorMode =
    record["defaultColorMode"] === "player" || record["defaultColorMode"] === "observer"
      ? record["defaultColorMode"]
      : null;
  const fontSizes = toFontSizes(record["fontSizes"]);

  return {
    ...(viewMode == null ? {} : { viewMode }),
    ...(defaultColorMode == null ? {} : { defaultColorMode }),
    ...(fontSizes == null ? {} : { fontSizes }),
  };
}

function toVisibleSections(value: string | null): StreamerViewVisibleSections {
  const record = toObjectOrDefault(value, {});
  const showTicker = typeof record["showTicker"] === "boolean" ? record["showTicker"] : null;
  const showTabs = typeof record["showTabs"] === "boolean" ? record["showTabs"] : null;
  const showTeamDetails = typeof record["showTeamDetails"] === "boolean" ? record["showTeamDetails"] : null;
  const showDiscordNames = typeof record["showDiscordNames"] === "boolean" ? record["showDiscordNames"] : null;
  const showXboxNames = typeof record["showXboxNames"] === "boolean" ? record["showXboxNames"] : null;
  const showServerIcon = typeof record["showServerIcon"] === "boolean" ? record["showServerIcon"] : null;
  const showTitle = typeof record["showTitle"] === "boolean" ? record["showTitle"] : null;
  const showSubtitle = typeof record["showSubtitle"] === "boolean" ? record["showSubtitle"] : null;
  const showScore = typeof record["showScore"] === "boolean" ? record["showScore"] : null;
  const showPreSeriesInfo =
    typeof record["showPreSeriesInfo"] === "boolean" ? record["showPreSeriesInfo"] : null;
  const selectedSlayerStats = isStringArray(record["selectedSlayerStats"])
    ? record["selectedSlayerStats"]
    : null;
  const medalRarityFilter = isNumberArray(record["medalRarityFilter"]) ? record["medalRarityFilter"] : null;
  const showObjectiveStats =
    typeof record["showObjectiveStats"] === "boolean" ? record["showObjectiveStats"] : null;

  return {
    ...(showTicker == null ? {} : { showTicker }),
    ...(showTabs == null ? {} : { showTabs }),
    ...(showTeamDetails == null ? {} : { showTeamDetails }),
    ...(showDiscordNames == null ? {} : { showDiscordNames }),
    ...(showXboxNames == null ? {} : { showXboxNames }),
    ...(showServerIcon == null ? {} : { showServerIcon }),
    ...(showTitle == null ? {} : { showTitle }),
    ...(showSubtitle == null ? {} : { showSubtitle }),
    ...(showScore == null ? {} : { showScore }),
    ...(showPreSeriesInfo == null ? {} : { showPreSeriesInfo }),
    ...(selectedSlayerStats == null ? {} : { selectedSlayerStats }),
    ...(showObjectiveStats == null ? {} : { showObjectiveStats }),
    ...(medalRarityFilter == null ? {} : { medalRarityFilter }),
  };
}

function toStyleFlags(value: string | null): StreamerViewStyleFlags {
  const record = toObjectOrDefault(value, {});
  const colorMode = record["colorMode"] === "player" || record["colorMode"] === "observer" ? record["colorMode"] : null;
  const teamColor = typeof record["teamColor"] === "string" ? record["teamColor"] : null;
  const enemyColor = typeof record["enemyColor"] === "string" ? record["enemyColor"] : null;
  const playerTeamColor = typeof record["playerTeamColor"] === "string" ? record["playerTeamColor"] : null;
  const playerEnemyColor = typeof record["playerEnemyColor"] === "string" ? record["playerEnemyColor"] : null;
  const observerTeamColor = typeof record["observerTeamColor"] === "string" ? record["observerTeamColor"] : null;
  const observerEnemyColor = typeof record["observerEnemyColor"] === "string" ? record["observerEnemyColor"] : null;
  const observerColorOverridesRecord =
    record["observerColorOverrides"] != null &&
    typeof record["observerColorOverrides"] === "object" &&
    !Array.isArray(record["observerColorOverrides"])
      ? (record["observerColorOverrides"] as Record<string, unknown>)
      : null;

  let observerColorOverrides: StreamerViewObserverColorOverrides | null = null;
  if (observerColorOverridesRecord != null) {
    const parsedEntries: Record<string, { teamColor?: string; enemyColor?: string }> = {};

    for (const [trackerId, override] of Object.entries(observerColorOverridesRecord)) {
      if (override == null || typeof override !== "object" || Array.isArray(override)) {
        continue;
      }

      const overrideRecord = override as Record<string, unknown>;
      const parsedTeamColor = typeof overrideRecord["teamColor"] === "string" ? overrideRecord["teamColor"] : null;
      const parsedEnemyColor = typeof overrideRecord["enemyColor"] === "string" ? overrideRecord["enemyColor"] : null;

      if (parsedTeamColor == null && parsedEnemyColor == null) {
        continue;
      }

      parsedEntries[trackerId] = {
        ...(parsedTeamColor == null ? {} : { teamColor: parsedTeamColor }),
        ...(parsedEnemyColor == null ? {} : { enemyColor: parsedEnemyColor }),
      };
    }

    observerColorOverrides = Object.keys(parsedEntries).length === 0 ? null : parsedEntries;
  }

  return {
    ...(colorMode == null ? {} : { colorMode }),
    ...(playerTeamColor == null ? {} : { playerTeamColor }),
    ...(playerEnemyColor == null ? {} : { playerEnemyColor }),
    ...(observerTeamColor == null ? {} : { observerTeamColor }),
    ...(observerEnemyColor == null ? {} : { observerEnemyColor }),
    ...(teamColor == null ? {} : { teamColor }),
    ...(enemyColor == null ? {} : { enemyColor }),
    ...(observerColorOverrides == null ? {} : { observerColorOverrides }),
  };
}

function toStreamerViewSettingsResponse(
  profileId: string,
  settings: StreamerViewSettingsRow | null,
  trackedXuid: string | null,
  viewerXuid: string | null,
): StreamerViewSettingsResponse {
  const layoutOptions = toLayoutOptions(settings?.LayoutOptionsJson ?? null);
  const styleFlags = toStyleFlags(settings?.StyleFlagsJson ?? null);
  const defaultColorMode =
    layoutOptions.defaultColorMode ?? styleFlags.colorMode ?? getDefaultStreamerColorMode(trackedXuid, viewerXuid);

  return {
    profileId,
    layoutOptions,
    visibleSections: toVisibleSections(settings?.VisibleSectionsJson ?? null),
    styleFlags,
    effectiveDefaults: {
      colorMode: defaultColorMode,
    },
    updatedAt: settings?.UpdatedAt ?? null,
  };
}

function getAvatarUrlFromGamerpic(gamerpic: unknown): string | null {
  if (!isRecord(gamerpic)) {
    return null;
  }

  const { ["xlarge"]: xlarge, ["large"]: large, ["medium"]: medium, ["small"]: small } = gamerpic;

  if (typeof xlarge === "string" && xlarge !== "") {
    return xlarge;
  }

  if (typeof large === "string" && large !== "") {
    return large;
  }

  if (typeof medium === "string" && medium !== "") {
    return medium;
  }

  if (typeof small === "string" && small !== "") {
    return small;
  }

  return null;
}

function getAvatarUrlFromUser(user: unknown): string | null {
  if (!isRecord(user)) {
    return null;
  }

  const gamerpicAvatar = getAvatarUrlFromGamerpic(user["gamerpic"]);
  if (gamerpicAvatar != null) {
    return gamerpicAvatar;
  }

  const { ["avatarUrl"]: avatarUrl } = user;
  if (typeof avatarUrl === "string" && avatarUrl !== "") {
    return avatarUrl;
  }

  return null;
}

function normalizeXuid(value: string): string {
  const trimmed = value.trim();
  const match = /^xuid\((.+)\)$/i.exec(trimmed);
  if (match?.[1] != null && match[1] !== "") {
    return match[1];
  }

  return trimmed;
}

function isValidXuid(value: string): boolean {
  return /^\d+$/.test(normalizeXuid(value));
}

const TEAM_COLOR_ID_REGEX = /^[a-z0-9-]{2,32}$/;

function parseColorId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!TEAM_COLOR_ID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function extractViewerColors(styleFlags: Record<string, unknown>): { teamColor?: string; enemyColor?: string } {
  const maybeTeamColor = parseColorId(styleFlags["teamColor"]);
  const maybeEnemyColor = parseColorId(styleFlags["enemyColor"]);

  const next: { teamColor?: string; enemyColor?: string } = {};
  if (maybeTeamColor != null) {
    next.teamColor = maybeTeamColor;
  }
  if (maybeEnemyColor != null) {
    next.enemyColor = maybeEnemyColor;
  }

  return next;
}

const ALLOWED_PROXY_METHODS = new Set([
  "getMatchSkill",
  "getMatchStats",
  "getMedalsMetadataFile",
  "getPlayerMatchCount",
  "getPlayerMatches",
  "getPlaylist",
  "getPlaylistCsr",
  "getSpecificAssetVersion",
  "getUser",
  "getUserServiceRecord",
  "getUsers",
]);

export class Server {
  readonly router: AutoRouterType;
  private readonly installServices: typeof installServices;
  private readonly getCommands: typeof getCommands;

  constructor({ router, installServices, getCommands }: ServerOpts) {
    this.router = router;
    this.installServices = installServices;
    this.getCommands = getCommands;

    this.addRoutes();
  }

  private async resolveAuthenticatedSession(
    request: Request,
    authService: ReturnType<typeof installServices>["authService"],
  ): Promise<AuthenticatedRouteSessionResult> {
    const session = await authService.validateSession(request);

    if (session === null) {
      return {
        isAuthenticated: false,
        response: new Response("Unauthorized", { status: 401 }),
      };
    }

    if (!session.isExpired) {
      return {
        isAuthenticated: true,
        session,
        refreshedSessionPayload: null,
      };
    }

    let refreshedSessionPayload: SessionTokenPayload | null;
    try {
      refreshedSessionPayload = await authService.refreshSession(session);
    } catch {
      const response = new Response("Unauthorized", { status: 401 });
      authService.clearSessionCookie(response);
      return {
        isAuthenticated: false,
        response,
      };
    }

    if (refreshedSessionPayload === null) {
      const response = new Response("Unauthorized", { status: 401 });
      authService.clearSessionCookie(response);
      return {
        isAuthenticated: false,
        response,
      };
    }

    return {
      isAuthenticated: true,
      session: {
        userId: refreshedSessionPayload.userId,
        accessToken: refreshedSessionPayload.accessToken,
        refreshToken: refreshedSessionPayload.refreshToken,
        expiresAt: refreshedSessionPayload.expiresAt,
        isExpired: false,
        ...(refreshedSessionPayload.avatarUrl != null ? { avatarUrl: refreshedSessionPayload.avatarUrl } : {}),
      },
      refreshedSessionPayload,
    };
  }

  private async withRefreshedSessionCookie(
    response: Response,
    authService: ReturnType<typeof installServices>["authService"],
    refreshedSessionPayload: SessionTokenPayload | null,
  ): Promise<Response> {
    if (refreshedSessionPayload == null) {
      return response;
    }

    const refreshedToken = await authService.createSessionToken(refreshedSessionPayload);
    authService.setSessionCookie(response, refreshedToken, refreshedSessionPayload.expiresAt);
    return response;
  }

  private addRoutes(): void {
    // Handle CORS preflight requests for API routes
    this.router.options("/api/*", (request, env: Env) => {
      return handleCorsPreflightRequest(request, env);
    });

    this.router.options("/auth/*", (request, env: Env) => {
      return handleCorsPreflightRequest(request, env);
    });

    this.router.get("/", (_request, env: Env) => {
      return new Response(
        `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands 🚀`,
      );
    });

    this.router.get("/auth/microsoft/start", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;
        const url = new URL(request.url);
        const redirect = url.searchParams.get("redirect") ?? undefined;

        const { url: authorizationUrl, state } = await authService.generateAuthorizationUrl(redirect);

        // Return the auth URL + state for frontend to navigate to
        return new Response(
          JSON.stringify({
            authUrl: authorizationUrl.toString(),
            state,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      } catch (error) {
        console.error("Auth start error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to generate authorization URL",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    });

    this.router.get("/auth/microsoft/callback", async (request, env: Env) => {
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code == null || state == null) {
          return new Response("Missing authorization code or state", { status: 400 });
        }

        const services = this.installServices({ env });
        const { authService } = services;

        // Exchange code for tokens and create session
        const { sessionPayload, redirectTo } = await authService.handleCallback(code, state);
        let sessionPayloadWithAvatar: SessionTokenPayload = sessionPayload;

        try {
          const xboxUser = await services.xboxService.getUserFromMicrosoftAccessToken(sessionPayload.accessToken);
          const nowEpoch = Math.floor(Date.now() / 1000);
          sessionPayloadWithAvatar = {
            ...sessionPayload,
            ...(xboxUser.avatarUrl != null ? { avatarUrl: xboxUser.avatarUrl } : {}),
          };

          const allIdentities = await services.databaseService.findLinkedIdentitiesByUserId(sessionPayload.userId);
          for (const identity of allIdentities) {
            if (identity.Provider === "xbox" && identity.IsActive === 1 && identity.ProviderUserId !== xboxUser.xuid) {
              await services.databaseService.upsertLinkedIdentity({
                ...identity,
                IsActive: 0,
                UpdatedAt: nowEpoch,
              });
            }
          }

          const existingIdentity = await services.databaseService.getLinkedIdentityByProvider("xbox", xboxUser.xuid);
          const linkedIdentity: LinkedIdentitiesRow = {
            IdentityId: existingIdentity?.IdentityId ?? crypto.randomUUID(),
            UserId: sessionPayload.userId,
            Provider: "xbox",
            ProviderUserId: xboxUser.xuid,
            Gamertag: xboxUser.gamertag,
            TwitchId: null,
            IsActive: 1,
            CreatedAt: existingIdentity?.CreatedAt ?? nowEpoch,
            UpdatedAt: nowEpoch,
          };

          await services.databaseService.upsertLinkedIdentity(linkedIdentity);
        } catch (error) {
          console.warn("Auth callback auto-link xbox identity skipped:", error);
        }

        const sessionToken = await authService.createSessionToken(sessionPayloadWithAvatar);
        const pagesRedirectUrl = new URL(redirectTo, env.FRONTEND_URL);

        // Create redirect response with Set-Cookie header
        const response = new Response(null, {
          status: 302,
          headers: {
            Location: pagesRedirectUrl.toString(),
          },
        });

        // Set session cookie
        authService.setSessionCookie(response, sessionToken, sessionPayloadWithAvatar.expiresAt);

        return response;
      } catch (error) {
        console.error("Auth callback error:", error);
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Authentication failed",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    });

    this.router.post("/auth/logout", (_request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;

        const response = new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });

        authService.clearSessionCookie(response);

        return response;
      } catch (error) {
        console.error("Auth logout error:", error);
        return new Response(JSON.stringify({ error: "Logout failed" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    });

    this.router.get("/auth/session", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;

        const session = await authService.validateSession(request);

        if (session === null) {
          return new Response(JSON.stringify({ authenticated: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let effectiveSession = session;
        let refreshedSessionPayload: SessionTokenPayload | null = null;

        if (session.isExpired) {
          try {
            refreshedSessionPayload = await authService.refreshSession(session);
          } catch {
            const response = new Response(JSON.stringify({ authenticated: false, expired: true }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
            authService.clearSessionCookie(response);
            return response;
          }

          if (refreshedSessionPayload === null) {
            const response = new Response(JSON.stringify({ authenticated: false, expired: true }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
            authService.clearSessionCookie(response);
            return response;
          }

          effectiveSession = {
            userId: refreshedSessionPayload.userId,
            accessToken: refreshedSessionPayload.accessToken,
            refreshToken: refreshedSessionPayload.refreshToken,
            expiresAt: refreshedSessionPayload.expiresAt,
            isExpired: false,
            ...(refreshedSessionPayload.avatarUrl != null ? { avatarUrl: refreshedSessionPayload.avatarUrl } : {}),
          };
        }

        let avatarUrl: string | null = effectiveSession.avatarUrl ?? null;

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(effectiveSession.userId);
        const xboxIdentities = identities.filter((identity) => identity.Provider === "xbox");

        const activeXboxIdentity = xboxIdentities.find(
          (identity) => identity.Provider === "xbox" && identity.IsActive === 1,
        );
        const selectedXboxIdentity =
          activeXboxIdentity ?? [...xboxIdentities].sort((a, b) => b.UpdatedAt - a.UpdatedAt)[0] ?? null;

        if (avatarUrl == null && selectedXboxIdentity != null) {
          const normalizedXuid = normalizeXuid(selectedXboxIdentity.ProviderUserId);

          if (selectedXboxIdentity.Gamertag != null && selectedXboxIdentity.Gamertag !== "") {
            try {
              const userByGamertag = await services.haloService.getUserByGamertag(selectedXboxIdentity.Gamertag);
              avatarUrl = getAvatarUrlFromUser(userByGamertag);
            } catch {
              avatarUrl = null;
            }
          }

          if (avatarUrl == null) {
            try {
              const users = await services.haloService.getUsersByXuids([normalizedXuid]);
              const [user] = users;
              avatarUrl = getAvatarUrlFromUser(user);
            } catch {
              avatarUrl = null;
            }
          }

          if (avatarUrl == null) {
            try {
              const xboxUsers = await services.xboxService.getUsersByXuids([normalizedXuid]);
              const [xboxUser] = xboxUsers;
              avatarUrl = getAvatarUrlFromUser(xboxUser);
            } catch {
              avatarUrl = null;
            }
          }

          if (avatarUrl == null && selectedXboxIdentity.Gamertag != null && selectedXboxIdentity.Gamertag !== "") {
            try {
              const xboxUserByGamertag = await services.xboxService.getUserByGamertag(selectedXboxIdentity.Gamertag);
              avatarUrl = getAvatarUrlFromUser(xboxUserByGamertag);
            } catch {
              avatarUrl = null;
            }
          }
        }

        const xboxGamertag = selectedXboxIdentity?.Gamertag ?? null;
        const xboxXuid = selectedXboxIdentity == null ? null : normalizeXuid(selectedXboxIdentity.ProviderUserId);

        let spartanToken: string | null = null;
        const includeSpartanToken = request.headers.get("x-include-spartan-token") === "true";

        if (includeSpartanToken) {
          try {
            const userTokenProvider = new UserTokenProvider({
              userMicrosoftAccessToken: effectiveSession.accessToken,
              userMicrosoftRefreshToken: effectiveSession.refreshToken,
              userMicrosoftAccessTokenExpiresAt: effectiveSession.expiresAt,
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              redirectUri: env.MICROSOFT_REDIRECT_URI,
              logService: services.logService,
            });

            spartanToken = await userTokenProvider.getSpartanToken();
          } catch {
            // Best-effort for frontend proxy pass-through; session remains valid without this.
            spartanToken = null;
          }
        }

        const response = new Response(
          JSON.stringify({
            authenticated: true,
            userId: effectiveSession.userId,
            expiresAt: effectiveSession.expiresAt,
            avatarUrl,
            xboxGamertag,
            xboxXuid,
            spartanToken,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );

        if (refreshedSessionPayload != null) {
          const refreshedToken = await authService.createSessionToken(refreshedSessionPayload);
          authService.setSessionCookie(response, refreshedToken, refreshedSessionPayload.expiresAt);
        }

        return response;
      } catch (error) {
        console.error("Auth session error:", error);
        return new Response(JSON.stringify({ error: "Failed to retrieve session" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/identities", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);

        return await this.withRefreshedSessionCookie(
          new Response(
            JSON.stringify({
              identities: identities.map((identity) => mapIdentityResponse(identity)),
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Identities list error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch identities" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/identities/link", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body = await request.json<Partial<LinkIdentityRequest>>();

        if (
          !isIdentityProvider(body.provider) ||
          typeof body.providerUserId !== "string" ||
          body.providerUserId === ""
        ) {
          return new Response("Invalid link request", { status: 400 });
        }

        if (body.provider === "xbox" && !isValidXuid(body.providerUserId)) {
          return new Response("Invalid Xbox identity request", { status: 400 });
        }

        const nowEpoch = Math.floor(Date.now() / 1000);
        const existingIdentity = await services.databaseService.getLinkedIdentityByProvider(
          body.provider,
          body.providerUserId,
        );

        if (body.provider === "xbox") {
          const allIdentities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
          for (const identity of allIdentities) {
            if (
              identity.Provider === "xbox" &&
              identity.IsActive === 1 &&
              identity.ProviderUserId !== body.providerUserId
            ) {
              await services.databaseService.upsertLinkedIdentity({
                ...identity,
                IsActive: 0,
                UpdatedAt: nowEpoch,
              });
            }
          }
        }

        const linkedIdentity: LinkedIdentitiesRow = {
          IdentityId: existingIdentity?.IdentityId ?? crypto.randomUUID(),
          UserId: session.userId,
          Provider: body.provider,
          ProviderUserId: body.providerUserId,
          Gamertag: typeof body.gamertag === "string" ? body.gamertag : null,
          TwitchId: typeof body.twitchId === "string" ? body.twitchId : null,
          IsActive: 1,
          CreatedAt: existingIdentity?.CreatedAt ?? nowEpoch,
          UpdatedAt: nowEpoch,
        };

        await services.databaseService.upsertLinkedIdentity(linkedIdentity);

        return await this.withRefreshedSessionCookie(
          new Response(
            JSON.stringify({
              identity: mapIdentityResponse(linkedIdentity),
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          ),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Identity link error:", error);
        return new Response(JSON.stringify({ error: "Failed to link identity" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/identities/unlink", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body = await request.json<Partial<UnlinkIdentityRequest>>();

        if (typeof body.identityId !== "string" || body.identityId === "") {
          return new Response("Invalid unlink request", { status: 400 });
        }

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const targetIdentity = identities.find((identity) => identity.IdentityId === body.identityId);

        if (targetIdentity == null) {
          return new Response("Identity not found", { status: 404 });
        }

        await services.databaseService.upsertLinkedIdentity({
          ...targetIdentity,
          IsActive: 0,
          UpdatedAt: Math.floor(Date.now() / 1000),
        });

        return await this.withRefreshedSessionCookie(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Identity unlink error:", error);
        return new Response(JSON.stringify({ error: "Failed to unlink identity" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/streamer-view", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const url = new URL(request.url);
        const profileId = url.searchParams.get("profileId");

        if (profileId == null || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        const profile = await services.databaseService.getIndividualTrackerProfile(profileId);
        if (profile?.UserId !== session.userId) {
          return new Response("Profile not found", { status: 404 });
        }

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const xboxIdentities = identities.filter((identity) => identity.Provider === "xbox");
        const activeXboxIdentity = xboxIdentities.find((identity) => identity.IsActive === 1);
        const selectedXboxIdentity =
          activeXboxIdentity ?? [...xboxIdentities].sort((a, b) => b.UpdatedAt - a.UpdatedAt)[0] ?? null;
        const selectedXboxXuid =
          selectedXboxIdentity == null ? null : normalizeXuid(selectedXboxIdentity.ProviderUserId);

        const settings = await services.databaseService.getStreamerViewSettings(profileId);
        return await this.withRefreshedSessionCookie(
          new Response(
            JSON.stringify(toStreamerViewSettingsResponse(profileId, settings, selectedXboxXuid, selectedXboxXuid)),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Streamer view get error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch streamer view settings" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.patch("/api/individual-tracker/streamer-view", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body = await request.json();

        if (!isRecord(body)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const {
          ["profileId"]: profileId,
          ["layoutOptions"]: layoutOptionsInput,
          ["visibleSections"]: visibleSectionsInput,
          ["styleFlags"]: styleFlagsInput,
        } = body;

        if (typeof profileId !== "string" || profileId === "") {
          return new Response("profileId must be a non-empty string", { status: 400 });
        }

        const profile = await services.databaseService.getIndividualTrackerProfile(profileId);
        if (profile?.UserId !== session.userId) {
          return new Response("Profile not found", { status: 404 });
        }

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const xboxIdentities = identities.filter((identity) => identity.Provider === "xbox");
        const activeXboxIdentity = xboxIdentities.find((identity) => identity.IsActive === 1);
        const selectedXboxIdentity =
          activeXboxIdentity ?? [...xboxIdentities].sort((a, b) => b.UpdatedAt - a.UpdatedAt)[0] ?? null;
        const selectedXboxXuid =
          selectedXboxIdentity == null ? null : normalizeXuid(selectedXboxIdentity.ProviderUserId);

        const current = await services.databaseService.getStreamerViewSettings(profileId);
        const currentLayout = toObjectOrDefault(current?.LayoutOptionsJson ?? null, {});
        const currentVisible = toObjectOrDefault(current?.VisibleSectionsJson ?? null, {});
        const currentStyle = toObjectOrDefault(current?.StyleFlagsJson ?? null, {});

        const layoutOptions = isRecord(layoutOptionsInput)
          ? { ...currentLayout, ...layoutOptionsInput }
          : currentLayout;

        const visibleSections = isRecord(visibleSectionsInput)
          ? { ...currentVisible, ...visibleSectionsInput }
          : currentVisible;

        const styleFlags = isRecord(styleFlagsInput) ? { ...currentStyle, ...styleFlagsInput } : currentStyle;
        const viewerColors = extractViewerColors(styleFlags);

        const updatedAt = Math.floor(Date.now() / 1000);
        await services.databaseService.upsertStreamerViewSettings({
          ProfileId: profileId,
          LayoutOptionsJson: JSON.stringify(layoutOptions),
          VisibleSectionsJson: JSON.stringify(visibleSections),
          StyleFlagsJson: JSON.stringify(styleFlags),
          UpdatedAt: updatedAt,
        });

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(session.userId);
        if (activeSession != null) {
          const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${activeSession.TrackerId}`);
          const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

          const doUrl = new URL(request.url);
          doUrl.pathname = "/viewer-style";

          try {
            await stub.fetch(
              new Request(doUrl.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: session.userId,
                  teamColor: viewerColors.teamColor,
                  enemyColor: viewerColors.enemyColor,
                }),
              }),
            );
          } catch (error) {
            console.warn("Failed to propagate streamer colors to active tracker", error);
          }
        }

        return await this.withRefreshedSessionCookie(
          new Response(
            JSON.stringify(
              toStreamerViewSettingsResponse(
                profileId,
                {
                  ProfileId: profileId,
                  LayoutOptionsJson: JSON.stringify(layoutOptions),
                  VisibleSectionsJson: JSON.stringify(visibleSections),
                  StyleFlagsJson: JSON.stringify(styleFlags),
                  UpdatedAt: updatedAt,
                },
                selectedXboxXuid,
                selectedXboxXuid,
              ),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Streamer view update error:", error);
        return new Response(JSON.stringify({ error: "Failed to update streamer view settings" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const profileResponse = await services.individualTrackerService.getProfile({ userId: session.userId });

        return await this.withRefreshedSessionCookie(
          new Response(JSON.stringify(profileResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual tracker profile get error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const createProfileRequest = { userId: session.userId };
        const nameVal = (body as { name?: unknown }).name;
        if (typeof nameVal === "string") {
          Object.assign(createProfileRequest, { name: nameVal });
        }
        const activeIdentityIdVal = (body as { activeIdentityId?: unknown }).activeIdentityId;
        if (Object.prototype.hasOwnProperty.call(body as object, "activeIdentityId")) {
          Object.assign(createProfileRequest, {
            activeIdentityId: typeof activeIdentityIdVal === "string" ? activeIdentityIdVal : null,
          });
        }

        const profileResponse = await services.individualTrackerService.createProfile(
          createProfileRequest as Parameters<typeof services.individualTrackerService.createProfile>[0],
        );

        return await this.withRefreshedSessionCookie(
          new Response(JSON.stringify(profileResponse), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual tracker profile create error:", error);
        return new Response(JSON.stringify({ error: "Failed to create profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.patch("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const { profileId } = body as { profileId?: unknown };
        if (typeof profileId !== "string" || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        const updates: { name?: string; activeIdentityId?: string | null } = {};

        const { name } = body as { name?: unknown };
        if (typeof name === "string") {
          updates.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(body as object, "activeIdentityId")) {
          const { activeIdentityId } = body as { activeIdentityId?: unknown };
          updates.activeIdentityId = typeof activeIdentityId === "string" ? activeIdentityId : null;
        }

        try {
          const profileResponse = await services.individualTrackerService.updateProfile({
            userId: session.userId,
            profileId,
            updates,
          });

          return await this.withRefreshedSessionCookie(
            new Response(JSON.stringify(profileResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
            services.authService,
            refreshedSessionPayload,
          );
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return new Response("Profile not found", { status: 404 });
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker profile update error:", error);
        return new Response(JSON.stringify({ error: "Failed to update profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:action", async (request, env: Env) => {
      try {
        const { action } = request.params as { action: string };
        if (action !== "games:add" && action !== "games:remove" && action !== "games:reorder") {
          return new Response("Not Found.", { status: 404 });
        }

        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const { profileId } = body as { profileId?: unknown };
        if (typeof profileId !== "string" || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        try {
          switch (action) {
            case "games:add": {
              const { matchId } = body as { matchId?: unknown };
              if (typeof matchId !== "string" || matchId === "") {
                return new Response("Missing matchId", { status: 400 });
              }

              const response = await services.individualTrackerService.addGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return await this.withRefreshedSessionCookie(
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
                services.authService,
                refreshedSessionPayload,
              );
            }

            case "games:remove": {
              const { matchId } = body as { matchId?: unknown };
              if (typeof matchId !== "string" || matchId === "") {
                return new Response("Missing matchId", { status: 400 });
              }

              const response = await services.individualTrackerService.removeGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return await this.withRefreshedSessionCookie(
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
                services.authService,
                refreshedSessionPayload,
              );
            }

            case "games:reorder": {
              const { orderedMatchIds } = body as { orderedMatchIds?: unknown };
              if (!Array.isArray(orderedMatchIds) || orderedMatchIds.some((matchId) => typeof matchId !== "string")) {
                return new Response("Invalid reorder payload", { status: 400 });
              }

              const response = await services.individualTrackerService.reorderGames({
                userId: session.userId,
                profileId,
                orderedMatchIds: orderedMatchIds as string[],
              });

              return await this.withRefreshedSessionCookie(
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
                services.authService,
                refreshedSessionPayload,
              );
            }

            default: {
              return new Response("Not Found.", { status: 404 });
            }
          }
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return new Response("Profile not found", { status: 404 });
          }
          if (error instanceof InvalidReorderError) {
            return new Response(error.message, { status: 400 });
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker games action error:", error);
        return new Response(JSON.stringify({ error: "Failed to process games action" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ─── Individual live tracker control routes ────────────────────────────────

    this.router.post("/api/individual-tracker/manage/start", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const rawIdleTimeout = (body as { idleTimeoutHours?: unknown }).idleTimeoutHours;
        const idleTimeoutHours: IdleTimeoutHours = (IDLE_TIMEOUT_HOURS as readonly number[]).includes(
          rawIdleTimeout as number,
        )
          ? (rawIdleTimeout as IdleTimeoutHours)
          : DEFAULT_IDLE_TIMEOUT_HOURS;

        const rawSearchStartTime = (body as { searchStartTime?: unknown }).searchStartTime;
        const searchStartTime =
          typeof rawSearchStartTime === "string" && rawSearchStartTime !== ""
            ? rawSearchStartTime
            : new Date().toISOString();

        const rawGamertag = (body as { gamertag?: unknown }).gamertag;
        const overrideGamertag =
          typeof rawGamertag === "string" && rawGamertag.trim() !== "" ? rawGamertag.trim() : null;

        // Resolve the tracker identity from either an explicit gamertag override or the active linked Xbox identity.
        let resolvedXuid: string;
        let resolvedGamertag: string;

        if (overrideGamertag != null) {
          try {
            const resolvedUser = await services.haloService.getUserByGamertag(overrideGamertag);
            resolvedXuid = normalizeXuid(resolvedUser.xuid);
            resolvedGamertag = resolvedUser.gamertag;
          } catch {
            return new Response(JSON.stringify({ error: "Gamertag not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else {
          const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
          const xboxIdentity = identities.find((id) => id.Provider === "xbox" && id.IsActive === 1);

          if (xboxIdentity == null) {
            return new Response(JSON.stringify({ error: "No active Xbox identity linked" }), {
              status: 422,
              headers: { "Content-Type": "application/json" },
            });
          }

          resolvedXuid = normalizeXuid(xboxIdentity.ProviderUserId);
          resolvedGamertag = xboxIdentity.Gamertag ?? xboxIdentity.ProviderUserId;
        }

        const profiles = await services.databaseService.findIndividualTrackerProfilesByUserId(session.userId);
        const defaultProfile = profiles[0] ?? null;
        let viewerTeamColor: string | undefined;
        let viewerEnemyColor: string | undefined;

        if (defaultProfile != null) {
          const settings = await services.databaseService.getStreamerViewSettings(defaultProfile.ProfileId);
          const styleFlags = toObjectOrDefault(settings?.StyleFlagsJson ?? null, {});
          const parsedColors = extractViewerColors(styleFlags);
          viewerTeamColor = parsedColors.teamColor;
          viewerEnemyColor = parsedColors.enemyColor;
        }

        const trackerId = crypto.randomUUID();
        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const startPayload: IndividualTrackerStartRequest = {
          userId: session.userId,
          trackerId,
          xuid: resolvedXuid,
          gamertag: resolvedGamertag,
          searchStartTime,
          idleTimeoutHours,
          userMicrosoftAccessToken: session.accessToken,
          userMicrosoftRefreshToken: session.refreshToken,
        };

        if (viewerTeamColor != null) {
          startPayload.teamColor = viewerTeamColor;
        }
        if (viewerEnemyColor != null) {
          startPayload.enemyColor = viewerEnemyColor;
        }

        const doUrl = new URL(request.url);
        doUrl.pathname = "/start";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(startPayload),
          }),
        );

        if (doResponse.ok) {
          await services.databaseService.upsertIndividualTrackerActiveSession(session.userId, trackerId);
          await services.databaseService.upsertIndividualTrackerSession(
            session.userId,
            trackerId,
            resolvedXuid,
            resolvedGamertag,
          );
        }

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker start error:", error);
        return new Response(JSON.stringify({ error: "Failed to start tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/stop", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/stop";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId }),
          }),
        );

        if (doResponse.ok) {
          await services.databaseService.deleteIndividualTrackerSession(session.userId, trackerId);
        }

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker stop error:", error);
        return new Response(JSON.stringify({ error: "Failed to stop tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/pause", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/pause";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker pause error:", error);
        return new Response(JSON.stringify({ error: "Failed to pause tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/resume", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/resume";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker resume error:", error);
        return new Response(JSON.stringify({ error: "Failed to resume tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/refresh", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/refresh";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker refresh error:", error);
        return new Response(JSON.stringify({ error: "Failed to refresh tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/manage/select-active", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body = await request.json<{ trackerId?: unknown }>();
        if (typeof body.trackerId !== "string" || body.trackerId === "") {
          return new Response(JSON.stringify({ error: "Missing trackerId" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sessions = await services.databaseService.findIndividualTrackerSessionsByUserId(session.userId);
        const trackerExists = sessions.some((s) => s.TrackerId === body.trackerId);
        if (!trackerExists) {
          return new Response(JSON.stringify({ error: "Tracker not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        await services.databaseService.upsertIndividualTrackerActiveSession(session.userId, body.trackerId);

        return await this.withRefreshedSessionCookie(
          new Response(JSON.stringify({ success: true, activeTrackerId: body.trackerId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker select-active error:", error);
        return new Response(JSON.stringify({ error: "Failed to select active tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.delete("/api/individual-tracker/:trackerId", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        // Attempt to stop the DO if it is running — fire-and-forget, do not fail the delete if DO is gone.
        try {
          const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
          const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);
          const doUrl = new URL(request.url);
          doUrl.pathname = "/stop";
          await stub.fetch(
            new Request(doUrl.toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: session.userId }),
            }),
          );
        } catch {
          // DO may already be gone; that is fine.
        }

        await services.databaseService.deleteIndividualTrackerSession(session.userId, trackerId);

        // Clear the active pointer if this was the active tracker.
        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(session.userId);
        if (activeSession?.TrackerId === trackerId) {
          // Pick the next available running tracker as the new active, or clear.
          const remaining = await services.databaseService.findIndividualTrackerSessionsByUserId(session.userId);
          const [next] = remaining;
          if (next != null) {
            await services.databaseService.upsertIndividualTrackerActiveSession(session.userId, next.TrackerId);
          } else {
            await services.databaseService.deleteIndividualTrackerActiveSession(session.userId);
          }
        }

        return await this.withRefreshedSessionCookie(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker delete error:", error);
        return new Response(JSON.stringify({ error: "Failed to delete tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/games-sync", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        if (!isRecord(body)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const { selectedMatchIds } = body;
        const { matchGroupings } = body;
        const { matchSummaries } = body;

        if (!isStringArray(selectedMatchIds)) {
          return new Response("selectedMatchIds must be an array of strings", { status: 400 });
        }

        if (!Array.isArray(matchGroupings) || !matchGroupings.every((group) => isStringArray(group))) {
          return new Response("matchGroupings must be an array of string arrays", { status: 400 });
        }

        if (
          !Array.isArray(matchSummaries) ||
          !matchSummaries.every((summary) => isIndividualTrackerMatchSummary(summary))
        ) {
          return new Response("matchSummaries must be valid match summary objects", { status: 400 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);
        const validatedSelectedMatchIds: string[] = selectedMatchIds.slice();
        const validatedMatchGroupings: string[][] = matchGroupings.map((group): string[] => group.slice());
        const validatedMatchSummaries: IndividualTrackerMatchSummary[] = matchSummaries.map((summary) => ({
          matchId: summary.matchId,
          startTime: summary.startTime,
          endTime: summary.endTime,
          mapAssetId: summary.mapAssetId,
          modeAssetId: summary.modeAssetId,
        }));

        const doUrl = new URL(request.url);
        doUrl.pathname = "/games-sync";
        const doPayload: IndividualTrackerGamesSyncRequest = {
          userId: session.userId,
          selectedMatchIds: validatedSelectedMatchIds,
          matchGroupings: validatedMatchGroupings,
          matchSummaries: validatedMatchSummaries,
        };
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(doPayload),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker games:sync error:", error);
        return new Response(JSON.stringify({ error: "Failed to sync games" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/series-groups-update", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        if (!isRecord(body)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const { matchIds, titleOverride, subtitleOverride } = body;

        if (!isStringArray(matchIds)) {
          return new Response("matchIds must be an array of strings", { status: 400 });
        }

        if (titleOverride !== null && titleOverride !== undefined && typeof titleOverride !== "string") {
          return new Response("titleOverride must be a string or null", { status: 400 });
        }

        if (subtitleOverride !== null && subtitleOverride !== undefined && typeof subtitleOverride !== "string") {
          return new Response("subtitleOverride must be a string or null", { status: 400 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/series-groups-update";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: session.userId,
              matchIds: matchIds.slice(),
              titleOverride: titleOverride ?? null,
              subtitleOverride: subtitleOverride ?? null,
            }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker series-groups-update error:", error);
        return new Response(JSON.stringify({ error: "Failed to update series labels" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/games:add", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const { matchId } = body as { matchId?: unknown };
        if (typeof matchId !== "string" || matchId === "") {
          return new Response("Missing matchId", { status: 400 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/games-add";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId, matchId }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker games:add error:", error);
        return new Response(JSON.stringify({ error: "Failed to add game" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:trackerId/games:remove", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const authentication = await this.resolveAuthenticatedSession(request, services.authService);

        if (!authentication.isAuthenticated) {
          return authentication.response;
        }

        const { session, refreshedSessionPayload } = authentication;

        const body: unknown = await request.json();
        const { matchId } = body as { matchId?: unknown };
        if (typeof matchId !== "string" || matchId === "") {
          return new Response("Missing matchId", { status: 400 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/games-remove";
        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: session.userId, matchId }),
          }),
        );

        return await this.withRefreshedSessionCookie(
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
          services.authService,
          refreshedSessionPayload,
        );
      } catch (error) {
        console.error("Individual live tracker games:remove error:", error);
        return new Response(JSON.stringify({ error: "Failed to remove game" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ─── Individual live tracker viewer routes (no auth required) ──────────────

    this.router.get("/api/individual-tracker/manage/:userId/trackers", async (request, env: Env) => {
      try {
        const { userId } = request.params as { userId: string };
        if (userId === "") {
          return new Response(JSON.stringify({ trackers: [] }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const services = this.installServices({ env });
        const sessions = await services.databaseService.findIndividualTrackerSessionsByUserId(userId);

        const trackers = sessions.map((session) => ({
          trackerId: session.TrackerId,
          gamertag: session.Gamertag,
          updatedAt: session.UpdatedAt,
        }));

        return new Response(JSON.stringify({ trackers }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker list error:", error);
        return new Response(JSON.stringify({ error: "Failed to list trackers" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/manage/:userId/:trackerId/status", async (request, env: Env) => {
      try {
        const { userId, trackerId } = request.params as { userId: string; trackerId: string };

        if (userId === "" || trackerId === "") {
          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          const services = this.installServices({ env });
          await services.databaseService.deleteIndividualTrackerSession(userId, trackerId);

          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const doData = await doResponse.json<{ state: unknown }>();
        return new Response(JSON.stringify({ activeTracker: doData.state }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker explicit status error:", error);
        return new Response(JSON.stringify({ error: "Failed to get tracker status" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/manage/:userId/statuses", async (request, env: Env) => {
      try {
        const { userId } = request.params as { userId: string };
        if (userId === "") {
          return new Response(JSON.stringify({ error: "Missing userId" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const csvTrackerIds = (url.searchParams.get("trackerIds") ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
        const repeatedTrackerIds = url.searchParams
          .getAll("trackerId")
          .map((id) => id.trim())
          .filter((id) => id !== "");

        const trackerIds = Array.from(new Set([...csvTrackerIds, ...repeatedTrackerIds]));

        if (trackerIds.length === 0) {
          return new Response(JSON.stringify({ error: "Provide trackerIds query parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (trackerIds.length > 50) {
          return new Response(JSON.stringify({ error: "Maximum 50 trackerIds per request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const entries = await Promise.all(
          trackerIds.map(async (trackerId) => {
            const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
            const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

            const doUrl = new URL(request.url);
            doUrl.pathname = "/status";
            doUrl.search = "";

            const doResponse = await stub.fetch(new Request(doUrl.toString()));

            if (doResponse.status === 404) {
              const services = this.installServices({ env });
              await services.databaseService.deleteIndividualTrackerSession(userId, trackerId);
              return [trackerId, null] as const;
            }

            if (!doResponse.ok) {
              throw new Error(`Failed to fetch tracker status (${doResponse.status.toString()})`);
            }

            const doData = await doResponse.json<{ state: unknown }>();
            return [trackerId, doData.state] as const;
          }),
        );

        return new Response(JSON.stringify({ statuses: Object.fromEntries(entries) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker batch status error:", error);
        return new Response(JSON.stringify({ error: "Failed to get tracker statuses" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/:xuid/active", async (request, env: Env) => {
      try {
        const { xuid } = request.params as { xuid: string };
        const normalizedXuid = normalizeXuid(xuid);
        if (!isValidXuid(normalizedXuid)) {
          return new Response(JSON.stringify({ error: "Invalid xuid" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const services = this.installServices({ env });
        const xboxIdentity = await services.databaseService.getLinkedIdentityByProvider("xbox", normalizedXuid);
        if (xboxIdentity?.IsActive !== 1) {
          return new Response(JSON.stringify({ status: "not-found", activeTracker: null, streamerView: null }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const profiles = await services.databaseService.findIndividualTrackerProfilesByUserId(xboxIdentity.UserId);
        const profile = profiles[0] ?? null;
        const activeSession = await services.databaseService.findIndividualTrackerActiveSessionByXuid(normalizedXuid);

        let trackedXuid: string | null = normalizedXuid;
        if (activeSession != null) {
          const sessions = await services.databaseService.findIndividualTrackerSessionsByUserId(activeSession.UserId);
          const activeTrackerSession =
            sessions.find((session) => session.TrackerId === activeSession.TrackerId) ?? null;
          trackedXuid = activeTrackerSession?.Xuid ?? trackedXuid;
        }

        const streamerViewSettings =
          profile == null
            ? null
            : toStreamerViewSettingsResponse(
                profile.ProfileId,
                await services.databaseService.getStreamerViewSettings(profile.ProfileId),
                trackedXuid,
                normalizedXuid,
              );

        if (activeSession == null) {
          return new Response(
            JSON.stringify({
              status: "offline",
              activeTracker: null,
              streamerView: streamerViewSettings,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${activeSession.UserId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          await services.databaseService.deleteIndividualTrackerActiveSession(activeSession.UserId);
          await services.databaseService.deleteIndividualTrackerSession(activeSession.UserId, activeSession.TrackerId);

          return new Response(
            JSON.stringify({
              status: "offline",
              activeTracker: null,
              streamerView: streamerViewSettings,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const doData = await doResponse.json<{ state: unknown }>();
        return new Response(
          JSON.stringify({
            status: "active",
            activeTracker: doData.state,
            streamerView: streamerViewSettings,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Individual live tracker xuid active REST error:", error);
        return new Response(JSON.stringify({ error: "Failed to resolve active tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/ws/individual-tracker/:xuid/active", async (request, env: Env) => {
      try {
        const { xuid } = request.params as { xuid: string };
        const normalizedXuid = normalizeXuid(xuid);
        if (!isValidXuid(normalizedXuid)) {
          return new Response("Invalid xuid", { status: 400 });
        }

        const services = this.installServices({ env });
        const xboxIdentity = await services.databaseService.getLinkedIdentityByProvider("xbox", normalizedXuid);
        if (xboxIdentity?.IsActive !== 1) {
          return new Response("No configured xuid found", { status: 404 });
        }

        const activeSession = await services.databaseService.findIndividualTrackerActiveSessionByXuid(normalizedXuid);
        if (activeSession == null) {
          return new Response("No active tracker found", { status: 404 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${activeSession.UserId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(new Request(doUrl.toString(), { headers: request.headers }));
      } catch (error) {
        console.error("Individual tracker xuid active WebSocket route error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    this.router.get("/ws/individual-tracker/:userId/:trackerId", async (request, env: Env) => {
      try {
        const { userId, trackerId } = request.params as { userId: string; trackerId: string };

        if (userId === "" || trackerId === "") {
          return new Response("Missing required parameters: userId, trackerId", { status: 400 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(new Request(doUrl.toString(), { headers: request.headers }));
      } catch (error) {
        console.error("Individual tracker WebSocket route error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    this.router.get("/ws/tracker/:guildId/:queueNumber", async (request, env: Env) => {
      try {
        // Extract parameters from itty-router
        const { guildId, queueNumber } = request.params as {
          guildId: string;
          queueNumber: string;
        };

        if (guildId === "" || queueNumber === "") {
          return new Response("Missing required parameters: guildId, queueNumber", { status: 400 });
        }

        const queueNum = parseInt(queueNumber, 10);
        if (isNaN(queueNum)) {
          return new Response("Invalid queue number", { status: 400 });
        }

        // Get the Durable Object stub using the same naming pattern
        const doId = env.LIVE_TRACKER_DO.idFromName(`${guildId}:${queueNum.toString()}`);
        const stub = env.LIVE_TRACKER_DO.get(doId);

        // Forward the WebSocket upgrade request to the DO
        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(
          new Request(doUrl.toString(), {
            headers: request.headers,
          }),
        );
      } catch (error) {
        console.error("WebSocket route error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    this.router.post("/interactions", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
      try {
        const services = this.installServices({ env });
        const { discordService } = services;
        const commands = this.getCommands(services, env);
        discordService.setCommands(commands);

        const { isValid, interaction, rawBody } = await discordService.verifyDiscordRequest(request);
        if (!isValid || !interaction) {
          services.logService.warn(
            "Invalid Discord request (failed verification)",
            new Map([
              ["rawBody", rawBody],
              ["headers", JSON.stringify(Array.from(request.headers.entries()))],
            ]),
          );
          return new Response("Bad request signature.", { status: 401 });
        }

        const { response, jobToComplete } = discordService.handleInteraction(interaction);

        if (jobToComplete) {
          ctx.waitUntil(jobToComplete());
        }

        return response;
      } catch (error) {
        console.error(error);
        console.trace();

        return new Response("Internal error", { status: 500 });
      }
    });

    this.router.post("/neatqueue", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
      try {
        const services = this.installServices({ env });
        const { neatQueueService } = services;

        const verifiedRequest = await neatQueueService.verifyRequest(request);
        if (!verifiedRequest.isValid) {
          services.logService.info(
            "Invalid NeatQueue request (failed verification)",
            new Map([
              ["rawBody", verifiedRequest.rawBody],
              ["headers", JSON.stringify(Array.from(request.headers.entries()))],
            ]),
          );
          return new Response("Bad request signature.", { status: 401 });
        }

        const { interaction, neatQueueConfig } = verifiedRequest;
        const { response, jobToComplete } = neatQueueService.handleRequest(interaction, neatQueueConfig);

        if (jobToComplete) {
          ctx.waitUntil(jobToComplete());
        }

        return response;
      } catch (error) {
        console.error(error);
        console.trace();

        return new Response("Internal error", { status: 500 });
      }
    });

    this.router.post("/proxy/halo-infinite", async (request, env: Env) => {
      try {
        const authHeader = request.headers.get("x-proxy-auth");
        if (authHeader != null && authHeader !== env.PROXY_WORKER_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        const hasValidWorkerToken = authHeader === env.PROXY_WORKER_TOKEN;

        let services: ReturnType<typeof this.installServices> | null = null;
        let sessionAccessToken: string | null = null;
        let refreshedSessionPayload: SessionTokenPayload | null = null;

        if (!hasValidWorkerToken) {
          services = this.installServices({ env });
          const session = await services.authService.validateSession(request);
          if (session === null) {
            return new Response("Unauthorized", { status: 401 });
          }

          if (session.isExpired) {
            try {
              refreshedSessionPayload = await services.authService.refreshSession(session);
            } catch {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return response;
            }

            if (refreshedSessionPayload === null) {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return response;
            }

            sessionAccessToken = refreshedSessionPayload.accessToken;
          } else {
            sessionAccessToken = session.accessToken;
          }
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        if (
          typeof body !== "object" ||
          body === null ||
          typeof (body as { method?: unknown }).method !== "string" ||
          !Array.isArray((body as { args?: unknown[] }).args)
        ) {
          return new Response("Invalid request format", { status: 400 });
        }

        const { method, args } = body as { method: string; args: unknown[] };

        if (!ALLOWED_PROXY_METHODS.has(method)) {
          return new Response(`Method not allowed: ${method}`, { status: 403 });
        }

        const spartanHeader = request.headers.get("x-343-authorization-spartan");

        let haloInfiniteClient: HaloInfiniteClient;
        if (spartanHeader != null && spartanHeader !== "") {
          const spartanTokenProvider: SpartanTokenProvider = {
            getSpartanToken: async () => Promise.resolve(spartanHeader),
            getCurrentExpiration: async () => Promise.resolve(null),
            clearSpartanToken: async () => Promise.resolve(),
          };
          haloInfiniteClient = new HaloInfiniteClient(spartanTokenProvider);
        } else if (sessionAccessToken !== null) {
          const token = sessionAccessToken;
          haloInfiniteClient = new HaloInfiniteClient(new AutoTokenProvider(async () => Promise.resolve(token)));
        } else {
          ({ haloInfiniteClient } = services ?? this.installServices({ env }));
        }

        const isFunctionProperty = <T>(
          obj: T,
          key: string,
        ): obj is T & Record<string, (...args: unknown[]) => unknown> => {
          return (
            Object.prototype.hasOwnProperty.call(obj, key) &&
            typeof (obj as Record<string, unknown>)[key] === "function"
          );
        };
        if (!isFunctionProperty(haloInfiniteClient, method)) {
          return new Response(`Method not found: ${method}`, { status: 404 });
        }

        const targetMethod = haloInfiniteClient[method] as (...a: unknown[]) => unknown;

        const result: unknown = await targetMethod.apply(haloInfiniteClient, args);

        const response = new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

        if (refreshedSessionPayload !== null && services !== null) {
          const refreshedToken = await services.authService.createSessionToken(refreshedSessionPayload);
          services.authService.setSessionCookie(response, refreshedToken, refreshedSessionPayload.expiresAt);
        }

        return response;
      } catch (error) {
        let errorBody: Record<string, unknown> = {};
        if (error instanceof Error) {
          errorBody = {
            message: error.message,
            stack: error.stack,
            name: error.name,
          };
        } else {
          errorBody = { error: String(error) };
        }
        return new Response(JSON.stringify(errorBody), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    });

    this.router.all("*", () => new Response("Not Found.", { status: 404 }));
  }
}
