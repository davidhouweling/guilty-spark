import type { AutoRouterType } from "itty-router";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import { z } from "zod";
import type { installServices } from "./services/install";
import type { getCommands } from "./commands/commands";
import type { SessionTokenPayload } from "./services/auth/types";
import { addCorsHeaders, handleCorsPreflightRequest } from "./base/cors";
import { parseJsonBody, parseQueryParams } from "./base/request-parsing";
import { ProfileNotFoundError, InvalidReorderError } from "./services/individual-tracker/errors";
import { DEFAULT_IDLE_TIMEOUT_HOURS, IDLE_TIMEOUT_HOURS } from "./durable-objects/individual-tracker/types";
import type { IdleTimeoutHours, IndividualTrackerStartRequest } from "./durable-objects/individual-tracker/types";
import type { IdentityProvider, LinkedIdentitiesRow } from "./services/database/types/linked_identities";

interface ServerOpts {
  router: AutoRouterType;
  installServices: typeof installServices;
  getCommands: typeof getCommands;
}

const identityLinkBodySchema = z.object({
  provider: z.enum(["xbox", "discord", "twitch"]),
  providerUserId: z.string().optional(),
  gamertag: z.string().optional(),
  twitchId: z.string().optional(),
});

const identityUnlinkBodySchema = z.object({
  identityId: z.string().min(1),
});

const streamerViewUpdateBodySchema = z.object({
  profileId: z.string().min(1),
  layoutOptions: z.record(z.string(), z.unknown()).optional(),
  visibleSections: z.record(z.string(), z.unknown()).optional(),
  styleFlags: z.record(z.string(), z.unknown()).optional(),
});

const createProfileBodySchema = z.object({
  name: z.string().optional(),
  activeIdentityId: z.string().nullable().optional(),
});

const updateProfileBodySchema = z.object({
  profileId: z.string().min(1),
  name: z.string().optional(),
  activeIdentityId: z.string().nullable().optional(),
});

const trackerGamesActionBodySchema = z.object({
  profileId: z.string().min(1),
  matchId: z.string().min(1).optional(),
  orderedMatchIds: z.array(z.string()).optional(),
});

const individualLiveTrackerStartBodySchema = z.object({
  idleTimeoutHours: z.number().optional(),
  searchStartTime: z.string().optional(),
});

const matchIdBodySchema = z.object({
  matchId: z.string().min(1),
});

const streamerViewQuerySchema = z.object({
  profileId: z.string().min(1),
});

const haloProxyBodySchema = z.object({
  method: z.string().min(1),
  args: z.array(z.unknown()),
});

const authStartQuerySchema = z.object({
  redirect: z.string().optional(),
});

const authCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

function createNoStoreJsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function isValidIsoTimestamp(value: string): boolean {
  const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (!isoTimestampPattern.test(value)) {
    return false;
  }

  const parsedDate = new Date(value);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString() === value;
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

function withCredentialedCors(request: Request, response: Response): Response {
  return addCorsHeaders(response, request, true);
}

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
    this.router.options("/api/*", (request) => {
      return handleCorsPreflightRequest(request, true);
    });
    this.router.options("/auth/*", (request) => {
      return handleCorsPreflightRequest(request, true);
    });
    this.router.options("/proxy/halo-infinite", (request) => {
      return handleCorsPreflightRequest(request, true);
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
        const parsedQuery = parseQueryParams(url, authStartQuerySchema, "Failed to generate authorization URL");
        if (!parsedQuery.success) {
          return withCredentialedCors(request, parsedQuery.response);
        }

        const { redirect } = parsedQuery.data;

        const { url: authorizationUrl, state, codeVerifier } = await authService.generateAuthorizationUrl();

        const response = createNoStoreJsonResponse(
          {
            authUrl: authorizationUrl.toString(),
            state,
          },
          200,
        );

        await authService.setPkceStateCookie(response, {
          codeVerifier,
          state,
          issuedAt: Date.now(),
          redirectTo: redirect ?? "/",
        });

        return withCredentialedCors(request, response);
      } catch (error) {
        console.error("Auth start error:", error);
        return withCredentialedCors(
          request,
          createNoStoreJsonResponse(
            {
              error: "Failed to generate authorization URL",
            },
            500,
          ),
        );
      }
    });

    this.router.get("/auth/microsoft/callback", async (request, env: Env) => {
      try {
        const url = new URL(request.url);
        const parsedQuery = parseQueryParams(url, authCallbackQuerySchema, "Authentication failed");
        if (!parsedQuery.success) {
          return withCredentialedCors(request, createNoStoreJsonResponse({ error: "Authentication failed" }, 400));
        }

        const { code, state } = parsedQuery.data;

        const services = this.installServices({ env });
        const { authService } = services;

        // Exchange code for tokens and create session
        const { sessionPayload, redirectTo } = await authService.handleCallback(request, code, state);
        const sessionToken = await authService.createSessionToken(sessionPayload);
        const pagesRedirectUrl = new URL(redirectTo, env.PAGES_URL);

        const response = new Response(null, {
          status: 302,
          headers: {
            Location: pagesRedirectUrl.toString(),
          },
        });

        // Set session cookie
        authService.setSessionCookie(response, sessionToken);
        authService.clearPkceStateCookie(response);

        return withCredentialedCors(request, response);
      } catch (error) {
        console.error("Auth callback error:", error);
        return withCredentialedCors(
          request,
          createNoStoreJsonResponse(
            {
              error: "Authentication failed",
            },
            400,
          ),
        );
      }
    });

    this.router.post("/auth/logout", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;
        const response = createNoStoreJsonResponse({ success: true }, 200);

        await authService.invalidateSession(request).catch((error: unknown) => {
          console.error("Auth logout revocation error:", error);
        });

        authService.clearSessionCookie(response);

        return withCredentialedCors(request, response);
      } catch (error) {
        console.error("Auth logout error:", error);
        return withCredentialedCors(request, createNoStoreJsonResponse({ error: "Logout failed" }, 500));
      }
    });

    this.router.get("/auth/session", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;

        const session = await authService.validateSession(request);

        if (session === null) {
          return withCredentialedCors(request, createNoStoreJsonResponse({ authenticated: false }, 401));
        }

        let authenticatedSession = session;
        if (session.isExpired) {
          try {
            const refreshedSession = await authService.refreshSession(session);
            if (refreshedSession == null) {
              const response = createNoStoreJsonResponse({ authenticated: false, expired: true }, 401);
              authService.clearSessionCookie(response);
              return withCredentialedCors(request, response);
            }

            authenticatedSession = {
              ...session,
              accessToken: refreshedSession.accessToken,
              refreshToken: refreshedSession.refreshToken,
              expiresAt: refreshedSession.expiresAt,
              isExpired: false,
            };
          } catch {
            const response = createNoStoreJsonResponse({ authenticated: false, expired: true }, 401);
            authService.clearSessionCookie(response);
            return withCredentialedCors(request, response);
          }
        }

        return withCredentialedCors(
          request,
          createNoStoreJsonResponse(
            { authenticated: true, userId: authenticatedSession.userId, expiresAt: authenticatedSession.expiresAt },
            200,
          ),
        );
      } catch (error) {
        console.error("Auth session error:", error);
        return withCredentialedCors(request, createNoStoreJsonResponse({ error: "Failed to retrieve session" }, 500));
      }
    });

    this.router.get("/api/identities", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);

        return withCredentialedCors(
          request,
          new Response(
            JSON.stringify({
              identities: identities.map((identity) => mapIdentityResponse(identity)),
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      } catch (error) {
        console.error("Identities list error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to fetch identities" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/identities/link", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, identityLinkBodySchema, "Invalid link request");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const {
          provider,
          providerUserId: providerUserIdVal,
          gamertag: gamertagVal,
          twitchId: twitchIdRaw,
        } = parsedBody.data;

        let providerUserId: string;
        let providerGamertag: string | null;

        switch (provider) {
          case "xbox": {
            const xboxUser = await services.xboxService.getUserFromMicrosoftAccessToken(session.accessToken);
            providerUserId = xboxUser.xuid;
            providerGamertag = xboxUser.gamertag;
            break;
          }
          case "discord":
          case "twitch": {
            if (typeof providerUserIdVal !== "string" || providerUserIdVal === "") {
              return withCredentialedCors(request, new Response("Invalid link request", { status: 400 }));
            }

            providerUserId = providerUserIdVal;
            providerGamertag = typeof gamertagVal === "string" ? gamertagVal : null;
            break;
          }
          default: {
            return withCredentialedCors(request, new Response("Invalid link request", { status: 400 }));
          }
        }

        const nowEpoch = Math.floor(Date.now() / 1000);
        const existingIdentity = await services.databaseService.getLinkedIdentityByProvider(provider, providerUserId);

        if (existingIdentity != null && existingIdentity.UserId !== session.userId) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ error: "Identity is already linked to another user" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        if (provider === "xbox") {
          const allIdentities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
          for (const identity of allIdentities) {
            if (identity.Provider === "xbox" && identity.IsActive === 1 && identity.ProviderUserId !== providerUserId) {
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
          Provider: provider,
          ProviderUserId: providerUserId,
          Gamertag: providerGamertag,
          TwitchId: typeof twitchIdRaw === "string" ? twitchIdRaw : null,
          IsActive: 1,
          CreatedAt: existingIdentity?.CreatedAt ?? nowEpoch,
          UpdatedAt: nowEpoch,
        };

        await services.databaseService.upsertLinkedIdentity(linkedIdentity);

        return withCredentialedCors(
          request,
          new Response(
            JSON.stringify({
              identity: mapIdentityResponse(linkedIdentity),
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      } catch (error) {
        console.error("Identity link error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to link identity" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/identities/unlink", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, identityUnlinkBodySchema, "Invalid unlink request");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { identityId: identityIdRaw } = parsedBody.data;

        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const targetIdentity = identities.find((identity) => identity.IdentityId === identityIdRaw);

        if (targetIdentity == null) {
          return withCredentialedCors(request, new Response("Identity not found", { status: 404 }));
        }

        await services.databaseService.upsertLinkedIdentity({
          ...targetIdentity,
          IsActive: 0,
          UpdatedAt: Math.floor(Date.now() / 1000),
        });

        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Identity unlink error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to unlink identity" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.get("/api/individual-tracker/streamer-view", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const url = new URL(request.url);
        const parsedQuery = parseQueryParams(url, streamerViewQuerySchema, "Missing profileId");
        if (!parsedQuery.success) {
          return withCredentialedCors(request, parsedQuery.response);
        }

        const { profileId } = parsedQuery.data;

        const profile = await services.databaseService.getIndividualTrackerProfile(profileId);
        if (profile?.UserId !== session.userId) {
          return withCredentialedCors(request, new Response("Profile not found", { status: 404 }));
        }

        const settings = await services.databaseService.getStreamerViewSettings(profileId);
        return withCredentialedCors(
          request,
          new Response(
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
          ),
        );
      } catch (error) {
        console.error("Streamer view get error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to fetch streamer view settings" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.patch("/api/individual-tracker/streamer-view", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, streamerViewUpdateBodySchema, "Missing profileId");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const {
          profileId: profileIdRaw,
          layoutOptions: layoutOptionsRaw,
          visibleSections: visibleSectionsRaw,
          styleFlags: styleFlagsRaw,
        } = parsedBody.data;

        const profile = await services.databaseService.getIndividualTrackerProfile(profileIdRaw);
        if (profile?.UserId !== session.userId) {
          return withCredentialedCors(request, new Response("Profile not found", { status: 404 }));
        }

        const current = await services.databaseService.getStreamerViewSettings(profileIdRaw);
        const currentLayout = toObjectOrDefault(current?.LayoutOptionsJson ?? null, {});
        const currentVisible = toObjectOrDefault(current?.VisibleSectionsJson ?? null, {});
        const currentStyle = toObjectOrDefault(current?.StyleFlagsJson ?? null, {});

        const layoutOptions = layoutOptionsRaw == null ? currentLayout : { ...currentLayout, ...layoutOptionsRaw };

        const visibleSections =
          visibleSectionsRaw == null ? currentVisible : { ...currentVisible, ...visibleSectionsRaw };

        const styleFlags = styleFlagsRaw == null ? currentStyle : { ...currentStyle, ...styleFlagsRaw };

        const updatedAt = Math.floor(Date.now() / 1000);
        await services.databaseService.upsertStreamerViewSettings({
          ProfileId: profileIdRaw,
          LayoutOptionsJson: JSON.stringify(layoutOptions),
          VisibleSectionsJson: JSON.stringify(visibleSections),
          StyleFlagsJson: JSON.stringify(styleFlags),
          UpdatedAt: updatedAt,
        });

        return withCredentialedCors(
          request,
          new Response(
            JSON.stringify({
              profileId: profileIdRaw,
              layoutOptions,
              visibleSections,
              styleFlags,
              updatedAt,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      } catch (error) {
        console.error("Streamer view update error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to update streamer view settings" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.get("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const response = await services.individualTrackerService.getProfile({ userId: session.userId });

        return withCredentialedCors(
          request,
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual tracker profile get error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to fetch profile" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, createProfileBodySchema, "Invalid profile payload");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { name: nameVal, activeIdentityId: activeIdentityIdVal } = parsedBody.data;
        const createProfileRequest = { userId: session.userId };
        if (nameVal != null) {
          Object.assign(createProfileRequest, { name: nameVal });
        }
        if (activeIdentityIdVal != null) {
          Object.assign(createProfileRequest, { activeIdentityId: activeIdentityIdVal });
        }

        const response = await services.individualTrackerService.createProfile(createProfileRequest);

        return withCredentialedCors(
          request,
          new Response(JSON.stringify(response), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual tracker profile create error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to create profile" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.patch("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, updateProfileBodySchema, "Missing profileId");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { profileId, name, activeIdentityId } = parsedBody.data;

        const updates: { name?: string; activeIdentityId?: string | null } = {};

        if (name != null) {
          updates.name = name;
        }

        if (activeIdentityId != null) {
          updates.activeIdentityId = activeIdentityId;
        }

        try {
          const response = await services.individualTrackerService.updateProfile({
            userId: session.userId,
            profileId,
            updates,
          });

          return withCredentialedCors(
            request,
            new Response(JSON.stringify(response), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return withCredentialedCors(request, new Response("Profile not found", { status: 404 }));
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker profile update error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to update profile" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/individual-tracker/:action", async (request, env: Env) => {
      try {
        const { action } = request.params as { action: string };
        if (action !== "games:add" && action !== "games:remove" && action !== "games:reorder") {
          return withCredentialedCors(request, new Response("Not Found.", { status: 404 }));
        }

        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, trackerGamesActionBodySchema, "Invalid games action payload");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { profileId, matchId, orderedMatchIds } = parsedBody.data;

        try {
          switch (action) {
            case "games:add": {
              if (matchId == null) {
                return withCredentialedCors(request, new Response("Missing matchId", { status: 400 }));
              }

              const response = await services.individualTrackerService.addGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return withCredentialedCors(
                request,
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            }

            case "games:remove": {
              if (matchId == null) {
                return withCredentialedCors(request, new Response("Missing matchId", { status: 400 }));
              }

              const response = await services.individualTrackerService.removeGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return withCredentialedCors(
                request,
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            }

            case "games:reorder": {
              if (orderedMatchIds == null) {
                return withCredentialedCors(request, new Response("Invalid reorder payload", { status: 400 }));
              }

              const response = await services.individualTrackerService.reorderGames({
                userId: session.userId,
                profileId,
                orderedMatchIds,
              });

              return withCredentialedCors(
                request,
                new Response(JSON.stringify(response), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            }

            default: {
              return withCredentialedCors(request, new Response("Not Found.", { status: 404 }));
            }
          }
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return withCredentialedCors(request, new Response("Profile not found", { status: 404 }));
          }
          if (error instanceof InvalidReorderError) {
            return withCredentialedCors(request, new Response(error.message, { status: 400 }));
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker games action error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to process games action" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    // ─── Individual live tracker control routes ────────────────────────────────

    this.router.post("/api/individual-live-tracker/start", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(
          request,
          individualLiveTrackerStartBodySchema,
          "Invalid tracker start request",
        );
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { idleTimeoutHours: rawIdleTimeout, searchStartTime: rawSearchStartTime } = parsedBody.data;
        const idleTimeoutHours: IdleTimeoutHours =
          IDLE_TIMEOUT_HOURS.find((allowedTimeout) => allowedTimeout === rawIdleTimeout) ?? DEFAULT_IDLE_TIMEOUT_HOURS;

        let searchStartTime = new Date().toISOString();
        if (rawSearchStartTime != null && rawSearchStartTime !== "") {
          if (!isValidIsoTimestamp(rawSearchStartTime)) {
            return withCredentialedCors(
              request,
              new Response(JSON.stringify({ error: "Invalid searchStartTime" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }),
            );
          }

          searchStartTime = rawSearchStartTime;
        }

        // Resolve the user's active Xbox identity for the XUID and gamertag.
        const identities = await services.databaseService.findLinkedIdentitiesByUserId(session.userId);
        const xboxIdentity = identities.find((id) => id.Provider === "xbox" && id.IsActive === 1);

        if (xboxIdentity == null) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ error: "No active Xbox identity linked" }), {
              status: 422,
              headers: { "Content-Type": "application/json" },
            }),
          );
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

        return withCredentialedCors(
          request,
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker start error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to start tracker" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/stop", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
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

        return withCredentialedCors(
          request,
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker stop error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to stop tracker" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.get("/api/individual-live-tracker/status", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(session.userId);
        if (activeSession == null) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ activeTracker: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ activeTracker: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        const responseBody = await doResponse.json<{ state: IndividualTrackerState }>();

        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ activeTracker: responseBody.state }), {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker status error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to get tracker status" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/games:add", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, matchIdBodySchema, "Missing matchId");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { matchId } = parsedBody.data;

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

        return withCredentialedCors(
          request,
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker games:add error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to add game" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    this.router.post("/api/individual-live-tracker/:trackerId/games:remove", async (request, env: Env) => {
      try {
        const { trackerId } = request.params as { trackerId: string };
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const parsedBody = await parseJsonBody(request, matchIdBodySchema, "Missing matchId");
        if (!parsedBody.success) {
          return withCredentialedCors(request, parsedBody.response);
        }

        const { matchId } = parsedBody.data;

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

        return withCredentialedCors(
          request,
          new Response(doResponse.body, {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker games:remove error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to remove game" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    });

    // ─── Individual live tracker viewer routes (no auth required) ──────────────

    this.router.get("/api/individual-live-tracker/:userId/active", async (request, env: Env) => {
      try {
        const { userId } = request.params as { userId: string };
        const services = this.installServices({ env });

        const activeSession = await services.databaseService.findIndividualTrackerActiveSession(userId);
        if (activeSession == null) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ activeTracker: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${activeSession.TrackerId}`);
        const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

        const doUrl = new URL(request.url);
        doUrl.pathname = "/status";
        const doResponse = await stub.fetch(new Request(doUrl.toString()));

        if (doResponse.status === 404) {
          return withCredentialedCors(
            request,
            new Response(JSON.stringify({ activeTracker: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        const responseBody = await doResponse.json<{ state: IndividualTrackerState }>();

        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ activeTracker: responseBody.state }), {
            status: doResponse.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        console.error("Individual live tracker active REST error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Failed to get active tracker" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
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
          return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
        }

        const hasValidWorkerToken = authHeader === env.PROXY_WORKER_TOKEN;

        let services: ReturnType<typeof this.installServices> | null = null;
        let microsoftAccessToken: string | null = null;
        let refreshedSessionPayload: SessionTokenPayload | null = null;

        if (!hasValidWorkerToken) {
          services = this.installServices({ env });
          const session = await services.authService.validateSession(request);
          if (session === null) {
            return withCredentialedCors(request, new Response("Unauthorized", { status: 401 }));
          }

          if (session.isExpired) {
            try {
              refreshedSessionPayload = await services.authService.refreshSession(session);
            } catch {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return withCredentialedCors(request, response);
            }

            if (refreshedSessionPayload === null) {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return withCredentialedCors(request, response);
            }

            microsoftAccessToken = refreshedSessionPayload.accessToken;
          } else {
            microsoftAccessToken = session.accessToken;
          }
        }

        const parsedProxyBody = await parseJsonBody(
          request,
          haloProxyBodySchema,
          "Invalid request format",
          "Invalid JSON body",
        );
        if (!parsedProxyBody.success) {
          return withCredentialedCors(request, parsedProxyBody.response);
        }

        const { method, args } = parsedProxyBody.data;

        const activeServices = services ?? this.installServices({ env });
        let haloInfiniteClient: HaloInfiniteClient;
        if (microsoftAccessToken !== null) {
          const xstsTokenInfo =
            await activeServices.xboxService.exchangeMicrosoftAccessTokenForXstsToken(microsoftAccessToken);
          haloInfiniteClient = new HaloInfiniteClient(
            new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken),
          );
        } else {
          ({ haloInfiniteClient } = activeServices);
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
          return withCredentialedCors(request, new Response(`Method not found: ${method}`, { status: 404 }));
        }

        const targetMethod = haloInfiniteClient[method] as (...a: unknown[]) => unknown;

        const result: unknown = await targetMethod.apply(haloInfiniteClient, args);

        const response = new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

        return withCredentialedCors(request, response);
      } catch (error) {
        console.error("Halo proxy error:", error);
        return withCredentialedCors(
          request,
          new Response(JSON.stringify({ error: "Proxy request failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    });

    this.router.all("*", () => new Response("Not Found.", { status: 404 }));
  }
}
