import type { AutoRouterType } from "itty-router";
import { AutoTokenProvider, HaloInfiniteClient } from "halo-infinite-api";
import { isRecord } from "@guilty-spark/shared/base/json-readers";
import type { installServices } from "./services/install";
import type { getCommands } from "./commands/commands";
import type { SessionTokenPayload } from "./services/auth/types";
import { handleCorsPreflightRequest } from "./base/cors";
import { ProfileNotFoundError, InvalidReorderError } from "./services/individual-tracker/errors";
import { DEFAULT_IDLE_TIMEOUT_HOURS, IDLE_TIMEOUT_HOURS } from "./durable-objects/individual-tracker/types";
import type { IdleTimeoutHours, IndividualTrackerStartRequest } from "./durable-objects/individual-tracker/types";
import type { IdentityProvider, LinkedIdentitiesRow } from "./services/database/types/linked_identities";

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

function isIdentityProvider(value: unknown): value is IdentityProvider {
  return value === "xbox" || value === "discord" || value === "twitch";
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

        if (session.isExpired) {
          return new Response(JSON.stringify({ authenticated: false, expired: true }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let avatarUrl: string | null = session.avatarUrl ?? null;

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
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

        return new Response(
          JSON.stringify({
            authenticated: true,
            userId: session.userId,
            expiresAt: session.expiresAt,
            avatarUrl,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);

        return new Response(
          JSON.stringify({
            identities: identities.map((identity) => mapIdentityResponse(identity)),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json<Partial<LinkIdentityRequest>>();

        if (
          !isIdentityProvider(body.provider) ||
          typeof body.providerUserId !== "string" ||
          body.providerUserId === ""
        ) {
          return new Response("Invalid link request", { status: 400 });
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

        return new Response(
          JSON.stringify({
            identity: mapIdentityResponse(linkedIdentity),
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const profileId = url.searchParams.get("profileId");

        if (profileId == null || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        const profile = await services.databaseService.getIndividualTrackerProfile(profileId);
        if (profile?.UserId !== session.userId) {
          return new Response("Profile not found", { status: 404 });
        }

        const settings = await services.databaseService.getStreamerViewSettings(profileId);
        return new Response(
          JSON.stringify({
            profileId,
            layoutOptions: toObjectOrDefault(settings?.LayoutOptionsJson ?? null, {}),
            visibleSections: toObjectOrDefault(settings?.VisibleSectionsJson ?? null, {}),
            styleFlags: toObjectOrDefault(settings?.StyleFlagsJson ?? null, {}),
            updatedAt: settings?.UpdatedAt ?? null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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
          return new Response("Missing profileId", { status: 400 });
        }

        const profile = await services.databaseService.getIndividualTrackerProfile(profileId);
        if (profile?.UserId !== session.userId) {
          return new Response("Profile not found", { status: 404 });
        }

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

        const updatedAt = Math.floor(Date.now() / 1000);
        await services.databaseService.upsertStreamerViewSettings({
          ProfileId: profileId,
          LayoutOptionsJson: JSON.stringify(layoutOptions),
          VisibleSectionsJson: JSON.stringify(visibleSections),
          StyleFlagsJson: JSON.stringify(styleFlags),
          UpdatedAt: updatedAt,
        });

        return new Response(
          JSON.stringify({
            profileId,
            layoutOptions,
            visibleSections,
            styleFlags,
            updatedAt,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const response = await services.individualTrackerService.getProfile({ userId: session.userId });

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        const response = await services.individualTrackerService.createProfile(
          createProfileRequest as Parameters<typeof services.individualTrackerService.createProfile>[0],
        );

        return new Response(JSON.stringify(response), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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
          const response = await services.individualTrackerService.updateProfile({
            userId: session.userId,
            profileId,
            updates,
          });

          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
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
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
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

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
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

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
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

    this.router.post("/api/individual-live-tracker/start", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        // Resolve the user's active Xbox identity for the XUID and gamertag.
        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const xboxIdentity = identities.find((id) => id.Provider === "xbox" && id.IsActive === 1);

        if (xboxIdentity == null) {
          return new Response(JSON.stringify({ error: "No active Xbox identity linked" }), {
            status: 422,
            headers: { "Content-Type": "application/json" },
          });
        }

        const trackerId = crypto.randomUUID();
        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const startPayload: IndividualTrackerStartRequest = {
          userId: session.userId,
          trackerId,
          xuid: xboxIdentity.ProviderUserId,
          gamertag: xboxIdentity.Gamertag ?? xboxIdentity.ProviderUserId,
          searchStartTime,
          idleTimeoutHours,
        };

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
        }

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker start error:", error);
        return new Response(JSON.stringify({ error: "Failed to start tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/stop", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker stop error:", error);
        return new Response(JSON.stringify({ error: "Failed to stop tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-live-tracker/status", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(session.userId);
        if (activeSession == null) {
          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker status error:", error);
        return new Response(JSON.stringify({ error: "Failed to get tracker status" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/games:add", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker games:add error:", error);
        return new Response(JSON.stringify({ error: "Failed to add game" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/games:remove", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker games:remove error:", error);
        return new Response(JSON.stringify({ error: "Failed to remove game" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ─── Individual live tracker viewer routes (no auth required) ──────────────

    this.router.get("/api/individual-live-tracker/:userId/active", async (request, env: Env) => {
      try {
        const { userId } = request.params as { userId: string };
        const services = this.installServices({ env });

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(userId);
        if (activeSession == null) {
          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          return new Response(JSON.stringify({ activeTracker: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(doResponse.body, {
          status: doResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual live tracker active REST error:", error);
        return new Response(JSON.stringify({ error: "Failed to get active tracker" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
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

    this.router.get("/ws/individual-tracker/:userId/active", async (request, env: Env) => {
      try {
        const { userId } = request.params as { userId: string };
        const services = this.installServices({ env });

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(userId);
        if (activeSession == null) {
          return new Response("No active tracker found", { status: 404 });
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(new Request(doUrl.toString(), { headers: request.headers }));
      } catch (error) {
        console.error("Individual tracker active WebSocket route error:", error);
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

        let haloInfiniteClient: HaloInfiniteClient;
        if (sessionAccessToken !== null) {
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
