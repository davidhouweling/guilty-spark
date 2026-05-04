import { describe, it, beforeEach, expect, vi } from "vitest";
import type { MockInstance } from "vitest";
import { AutoRouter } from "itty-router";
import { InteractionType } from "discord-api-types/v10";
import { AutoTokenProvider, HaloInfiniteClient } from "halo-infinite-api";
import { installFakeServicesWith } from "../services/fakes/services";
import { Server } from "../server";
import { getCommands } from "../commands/commands";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeHaloInfiniteClient } from "../services/halo/fakes/infinite-client.fake";
import { pingInteraction } from "../services/discord/fakes/data";
import { aFakeIndividualTrackerActiveSessionsRow } from "../services/database/fakes/database.fake";
import type { AuthService } from "../services/auth/auth";
import type { SessionTokenPayload } from "../services/auth/types";
import type { IndividualTrackerDO } from "../worker";

vi.mock("halo-infinite-api", async () => {
  const actual = await import("halo-infinite-api");
  return {
    ...actual,
    AutoTokenProvider: vi.fn(),
    HaloInfiniteClient: vi.fn(),
  };
});

describe("Server", () => {
  let env: Env;
  let installServices: typeof installFakeServicesWith;
  let server: Server;

  beforeEach(() => {
    env = aFakeEnvWith();
    installServices = installFakeServicesWith;
    server = new Server({
      router: AutoRouter(),
      installServices,
      getCommands,
    });
  });

  describe("GET /", () => {
    it("responds with a welcome message containing the DISCORD_APP_ID", async () => {
      const req = new Request("http://localhost/", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).toContain(env.DISCORD_APP_ID);
      expect(text).toContain("Guilty Spark");
    });
  });

  describe("Unknown route", () => {
    it("responds with 404", async () => {
      const req = new Request("http://localhost/unknown", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe("Not Found.");
    });
  });

  describe("GET /auth/microsoft/start", () => {
    it("passes redirect query to authorization url generation", async () => {
      let capturedRedirect: string | undefined;

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "generateAuthorizationUrl").mockImplementation(async (redirectTo) => {
          capturedRedirect = redirectTo;

          return Promise.resolve({
            url: new URL("https://login.microsoftonline.com/authorize"),
            state: "state-123",
            codeVerifier: "verifier-123",
          });
        });
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/auth/microsoft/start?redirect=%2Findividual-tracker%3Fqueue%3D3", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<{ authUrl: string; state: string }>();
      expect(body).toEqual({ authUrl: "https://login.microsoftonline.com/authorize", state: "state-123" });
      expect(capturedRedirect).toBe("/individual-tracker?queue=3");
    });
  });

  describe("GET /auth/microsoft/callback", () => {
    it("sets cookie and redirects to pages url with callback redirect path", async () => {
      const sessionPayload: SessionTokenPayload = {
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
      };

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "handleCallback").mockResolvedValue({
          sessionPayload,
          redirectTo: "/individual-tracker?queue=3",
        });
        vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("session-token");
        vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockResolvedValue({
          xuid: "2533274844642438",
          gamertag: "TesterOne",
          avatarUrl: "https://images.example.com/avatar.png",
        });
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
        vi.spyOn(services.databaseService, "getLinkedIdentityByProvider").mockResolvedValue(null);
        vi.spyOn(services.databaseService, "upsertLinkedIdentity").mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/auth/microsoft/callback?code=test-code&state=test-state", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("http://localhost:4321/individual-tracker?queue=3");
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=");
    });

    it("auto-links xbox identity for the authenticated user", async () => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("identity-uuid-1");
      let capturedServices = installFakeServicesWith({ env });
      let getUserFromMicrosoftAccessTokenSpy = vi.spyOn(
        capturedServices.xboxService,
        "getUserFromMicrosoftAccessToken",
      );
      let upsertLinkedIdentitySpy = vi.spyOn(capturedServices.databaseService, "upsertLinkedIdentity");

      const sessionPayload: SessionTokenPayload = {
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
      };

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        capturedServices = services;
        getUserFromMicrosoftAccessTokenSpy = vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken");
        upsertLinkedIdentitySpy = vi.spyOn(services.databaseService, "upsertLinkedIdentity");
        vi.spyOn(services.authService, "handleCallback").mockResolvedValue({
          sessionPayload,
          redirectTo: "/individual-tracker",
        });
        vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("session-token");
        getUserFromMicrosoftAccessTokenSpy.mockResolvedValue({
          xuid: "2533274844642438",
          gamertag: "TesterOne",
          avatarUrl: "https://images.example.com/avatar.png",
        });
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
        vi.spyOn(services.databaseService, "getLinkedIdentityByProvider").mockResolvedValue(null);
        upsertLinkedIdentitySpy.mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/auth/microsoft/callback?code=test-code&state=test-state", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(302);

      expect(getUserFromMicrosoftAccessTokenSpy).toHaveBeenCalledWith("access-token");
      expect(upsertLinkedIdentitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          IdentityId: "identity-uuid-1",
          UserId: "user-123",
          Provider: "xbox",
          ProviderUserId: "2533274844642438",
          Gamertag: "TesterOne",
          IsActive: 1,
        }),
      );
    });
  });

  describe("POST /auth/logout", () => {
    it("returns 200 and clears the session cookie", async () => {
      const req = new Request("http://localhost/auth/logout", { method: "POST" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json<{ success: boolean }>();
      expect(body).toEqual({ success: true });
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("auth-session=");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("returns 500 with error message when clearSessionCookie throws", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "clearSessionCookie").mockImplementation(() => {
          throw new Error("Cookie error");
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/logout", { method: "POST" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Logout failed" });
    });
  });

  describe("GET /auth/session", () => {
    let refreshSessionSpy: MockInstance<AuthService["refreshSession"]>;
    let createSessionTokenSpy: MockInstance<AuthService["createSessionToken"]>;
    let setSessionCookieSpy: MockInstance<AuthService["setSessionCookie"]>;

    it("returns 401 with authenticated false when no session cookie is present", async () => {
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const body = await res.json<{ authenticated: boolean }>();
      expect(body).toEqual({ authenticated: false });
    });

    it("returns 401 with expired flag when session is expired and cannot be refreshed", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const body = await res.json<{ authenticated: boolean; expired: boolean }>();
      expect(body).toEqual({ authenticated: false, expired: true });
    });

    it("refreshes an expired session and reissues the session cookie", async () => {
      const refreshedExpiresAt = Date.now() + 7200000;
      const refreshedPayload: SessionTokenPayload = {
        userId: "user-123",
        accessToken: "refreshed-access-token",
        refreshToken: "refreshed-refresh-token",
        expiresAt: refreshedExpiresAt,
        issuedAt: Date.now(),
      };

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "expired-access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        refreshSessionSpy = vi.spyOn(services.authService, "refreshSession").mockResolvedValue(refreshedPayload);
        createSessionTokenSpy = vi
          .spyOn(services.authService, "createSessionToken")
          .mockResolvedValue("refreshed-session-token");
        setSessionCookieSpy = vi.spyOn(services.authService, "setSessionCookie");
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        authenticated: true,
        userId: "user-123",
        expiresAt: refreshedExpiresAt,
        avatarUrl: null,
        xboxGamertag: null,
        spartanToken: null,
      });

      expect(refreshSessionSpy).toHaveBeenCalled();
      expect(createSessionTokenSpy).toHaveBeenCalledWith(refreshedPayload);
      expect(setSessionCookieSpy).toHaveBeenCalled();
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=refreshed-session-token");
    });

    it("clears the session cookie when refresh fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "expired-access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        vi.spyOn(services.authService, "refreshSession").mockRejectedValue(new Error("refresh failed"));
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ authenticated: false, expired: true });
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("returns 200 with user info when session is valid", async () => {
      const expiresAt = Date.now() + 3600000;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt,
          isExpired: false,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json<{
        authenticated: boolean;
        userId: string;
        expiresAt: number;
        avatarUrl: null;
        xboxGamertag: string | null;
        spartanToken: string | null;
      }>();
      expect(body).toEqual({
        authenticated: true,
        userId: "user-123",
        expiresAt,
        avatarUrl: null,
        xboxGamertag: null,
        spartanToken: null,
      });
    });

    it("returns avatarUrl when a linked xbox identity resolves a gamerpic", async () => {
      const expiresAt = Date.now() + 3600000;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
          {
            IdentityId: "identity-1",
            UserId: "user-123",
            Provider: "xbox",
            ProviderUserId: "2533274844642438",
            Gamertag: "TesterOne",
            TwitchId: null,
            IsActive: 1,
            CreatedAt: 1,
            UpdatedAt: 2,
          },
        ]);
        vi.spyOn(services.haloService, "getUserByGamertag").mockResolvedValue({
          xuid: "2533274844642438",
          gamertag: "TesterOne",
          gamerpic: {
            small: "https://images.example.com/small.png",
            medium: "https://images.example.com/medium.png",
            large: "https://images.example.com/large.png",
            xlarge: "https://images.example.com/xlarge.png",
          },
        });
        return services;
      });
      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        authenticated: true,
        userId: "user-123",
        expiresAt,
        avatarUrl: "https://images.example.com/xlarge.png",
        xboxGamertag: "TesterOne",
        spartanToken: null,
      });
    });

    it("returns 500 with error message when validateSession throws", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockRejectedValue(new Error("Session error"));
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Failed to retrieve session" });
    });
  });

  describe("/api/individual-tracker", () => {
    it("GET /api/individual-tracker/profile returns 401 when session is missing", async () => {
      const req = new Request("http://localhost/api/individual-tracker/profile", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Unauthorized");
    });

    it("GET /api/individual-tracker/profile returns null profile when user has no profiles", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([]);
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/profile", {
        method: "GET",
        headers: { cookie: "auth-session=valid-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ profile: null, games: [] });
    });

    it("GET /api/individual-tracker/profile refreshes an expired session and rotates the cookie", async () => {
      const refreshedPayload: SessionTokenPayload = {
        userId: "user-123",
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
      };

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "expired-access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        vi.spyOn(services.authService, "refreshSession").mockResolvedValue(refreshedPayload);
        vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("rotated-session-token");
        vi.spyOn(services.databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([]);
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/profile", {
        method: "GET",
        headers: { cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ profile: null, games: [] });
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=rotated-session-token");
    });

    it("POST /api/individual-tracker/profile creates a profile for authenticated user", async () => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("profile-uuid-1");

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "createIndividualTrackerProfile").mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/profile", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ name: "stream-profile" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(201);
      const body = await res.json<{ profile: { ProfileId: string; UserId: string; Name: string } }>();
      expect(body.profile.ProfileId).toBe("profile-uuid-1");
      expect(body.profile.UserId).toBe("user-123");
      expect(body.profile.Name).toBe("stream-profile");
    });

    it("PATCH /api/individual-tracker/profile returns 404 when profile is not owned by user", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerProfile").mockResolvedValue({
          ProfileId: "profile-1",
          UserId: "other-user",
          ActiveIdentityId: null,
          Name: "default",
          IdleTimeoutHours: 1,
          AllowContinueAfterLogout: 0,
          CreatedAt: 1,
          UpdatedAt: 1,
        });
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ profileId: "profile-1", name: "updated" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Profile not found");
    });

    it("POST /api/individual-tracker/games:add appends game to profile", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerProfile").mockResolvedValue({
          ProfileId: "profile-1",
          UserId: "user-123",
          ActiveIdentityId: null,
          Name: "default",
          IdleTimeoutHours: 1,
          AllowContinueAfterLogout: 0,
          CreatedAt: 1,
          UpdatedAt: 1,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerGames")
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              ProfileId: "profile-1",
              MatchId: "match-1",
              Position: 1,
              Included: 1,
              AnnotationsJson: "{}",
              CreatedAt: 1,
              UpdatedAt: 1,
            },
          ]);
        vi.spyOn(services.databaseService, "replaceIndividualTrackerGames").mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/games:add", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ profileId: "profile-1", matchId: "match-1" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<{ games: { MatchId: string }[] }>();
      expect(body.games[0]?.MatchId).toBe("match-1");
    });

    it("POST /api/individual-tracker/games:reorder returns 400 for mismatched payload", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerProfile").mockResolvedValue({
          ProfileId: "profile-1",
          UserId: "user-123",
          ActiveIdentityId: null,
          Name: "default",
          IdleTimeoutHours: 1,
          AllowContinueAfterLogout: 0,
          CreatedAt: 1,
          UpdatedAt: 1,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerGames").mockResolvedValue([
          {
            ProfileId: "profile-1",
            MatchId: "match-1",
            Position: 1,
            Included: 1,
            AnnotationsJson: "{}",
            CreatedAt: 1,
            UpdatedAt: 1,
          },
        ]);
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/games:reorder", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ profileId: "profile-1", orderedMatchIds: ["match-1", "match-2"] }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("orderedMatchIds must include all existing games");
    });

    it("POST /api/individual-tracker/:trackerId/games-sync forwards a single bulk payload to the DO", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });

      let forwardedBody: unknown = null;
      const doFetch = vi.fn(async (input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : new Request(input);
        forwardedBody = await request.json();
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const namespacePrototype = Object.getPrototypeOf(env.INDIVIDUAL_TRACKER_DO) as object | null;
      const individualTrackerNamespace = Object.assign(
        Object.create(namespacePrototype) as DurableObjectNamespace<IndividualTrackerDO>,
        env.INDIVIDUAL_TRACKER_DO,
        {
          get: () =>
            ({
              __DURABLE_OBJECT_BRAND: undefined as never,
              fetch: doFetch,
              id: env.INDIVIDUAL_TRACKER_DO.idFromName("sync-stub"),
              connect: vi.fn(),
            }) as DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded,
        },
      );

      const envWithSyncStub = aFakeEnvWith({
        INDIVIDUAL_TRACKER_DO: individualTrackerNamespace,
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/tracker-1/games-sync", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({
          selectedMatchIds: ["match-2", "match-3"],
          matchGroupings: [["match-2", "match-3"]],
          matchSummaries: [
            {
              matchId: "match-2",
              startTime: "2026-01-01T00:00:00.000Z",
              endTime: "2026-01-01T00:10:00.000Z",
              mapAssetId: "map-2",
              modeAssetId: "mode-2",
            },
            {
              matchId: "match-3",
              startTime: "2026-01-01T00:15:00.000Z",
              endTime: "2026-01-01T00:25:00.000Z",
              mapAssetId: "map-3",
              modeAssetId: "mode-3",
            },
          ],
        }),
      });
      const res = (await server.router.fetch(req, envWithSyncStub)) as Response;

      expect(res.status).toBe(200);
      expect(doFetch).toHaveBeenCalledOnce();
      expect(forwardedBody).toEqual({
        userId: "user-123",
        selectedMatchIds: ["match-2", "match-3"],
        matchGroupings: [["match-2", "match-3"]],
        matchSummaries: [
          {
            matchId: "match-2",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:10:00.000Z",
            mapAssetId: "map-2",
            modeAssetId: "mode-2",
          },
          {
            matchId: "match-3",
            startTime: "2026-01-01T00:15:00.000Z",
            endTime: "2026-01-01T00:25:00.000Z",
            mapAssetId: "map-3",
            modeAssetId: "mode-3",
          },
        ],
      });
    });

    it("POST /api/individual-tracker/:trackerId/refresh forwards owner refreshes to the DO", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });

      let forwardedBody: unknown = null;
      const doFetch = vi.fn(async (input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : new Request(input);
        forwardedBody = await request.json();
        return new Response(JSON.stringify({ success: true, state: { trackerId: "tracker-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const namespacePrototype = Object.getPrototypeOf(env.INDIVIDUAL_TRACKER_DO) as object | null;
      const individualTrackerNamespace = Object.assign(
        Object.create(namespacePrototype) as DurableObjectNamespace<IndividualTrackerDO>,
        env.INDIVIDUAL_TRACKER_DO,
        {
          get: () =>
            ({
              __DURABLE_OBJECT_BRAND: undefined as never,
              fetch: doFetch,
              id: env.INDIVIDUAL_TRACKER_DO.idFromName("refresh-stub"),
              connect: vi.fn(),
            }) as DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded,
        },
      );

      const envWithRefreshStub = aFakeEnvWith({
        INDIVIDUAL_TRACKER_DO: individualTrackerNamespace,
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/tracker-1/refresh", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({}),
      });
      const res = (await server.router.fetch(req, envWithRefreshStub)) as Response;

      expect(res.status).toBe(200);
      expect(doFetch).toHaveBeenCalledOnce();
      expect(forwardedBody).toEqual({ userId: "user-123" });
    });

    it("POST /api/individual-tracker/:trackerId/series-groups-update forwards grouped-series labels to the DO", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });

      let forwardedBody: unknown = null;
      const doFetch = vi.fn(async (input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : new Request(input);
        forwardedBody = await request.json();
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const namespacePrototype = Object.getPrototypeOf(env.INDIVIDUAL_TRACKER_DO) as object | null;
      const individualTrackerNamespace = Object.assign(
        Object.create(namespacePrototype) as DurableObjectNamespace<IndividualTrackerDO>,
        env.INDIVIDUAL_TRACKER_DO,
        {
          get: () =>
            ({
              __DURABLE_OBJECT_BRAND: undefined as never,
              fetch: doFetch,
              id: env.INDIVIDUAL_TRACKER_DO.idFromName("series-group-stub"),
              connect: vi.fn(),
            }) as DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded,
        },
      );

      const envWithSeriesGroupStub = aFakeEnvWith({
        INDIVIDUAL_TRACKER_DO: individualTrackerNamespace,
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/tracker-1/series-groups-update", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({
          matchIds: ["match-2", "match-3"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        }),
      });
      const res = (await server.router.fetch(req, envWithSeriesGroupStub)) as Response;

      expect(res.status).toBe(200);
      expect(doFetch).toHaveBeenCalledOnce();
      expect(forwardedBody).toEqual({
        userId: "user-123",
        matchIds: ["match-2", "match-3"],
        titleOverride: "Dog Crew",
        subtitleOverride: "Queue #777",
      });
    });
  });

  describe("/api/identities", () => {
    it("GET /api/identities returns mapped identities for authenticated user", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
          {
            IdentityId: "identity-1",
            UserId: "user-123",
            Provider: "xbox",
            ProviderUserId: "xuid-1",
            Gamertag: "TesterOne",
            TwitchId: null,
            IsActive: 1,
            CreatedAt: 1,
            UpdatedAt: 2,
          },
        ]);
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/identities", {
        method: "GET",
        headers: { cookie: "auth-session=valid-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        identities: [
          {
            identityId: "identity-1",
            userId: "user-123",
            provider: "xbox",
            providerUserId: "xuid-1",
            gamertag: "TesterOne",
            twitchId: null,
            isActive: true,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      });
    });

    it("POST /api/identities/link upserts active identity", async () => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("identity-uuid-1");

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getLinkedIdentityByProvider").mockResolvedValue(null);
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
        vi.spyOn(services.databaseService, "upsertLinkedIdentity").mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/identities/link", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ provider: "xbox", providerUserId: "2533274844642438", gamertag: "TesterOne" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(201);
      const body = await res.json<{ identity: { identityId: string; provider: string; isActive: boolean } }>();
      expect(body.identity.identityId).toBe("identity-uuid-1");
      expect(body.identity.provider).toBe("xbox");
      expect(body.identity.isActive).toBe(true);
    });

    it("POST /api/identities/link rejects xbox identities without a valid xuid", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/identities/link", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ provider: "xbox", providerUserId: "xuid-1", gamertag: "TesterOne" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(400);
      await expect(res.text()).resolves.toBe("Invalid Xbox identity request");
    });

    it("POST /api/identities/unlink deactivates owned identity", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
          {
            IdentityId: "identity-1",
            UserId: "user-123",
            Provider: "xbox",
            ProviderUserId: "xuid-1",
            Gamertag: "TesterOne",
            TwitchId: null,
            IsActive: 1,
            CreatedAt: 1,
            UpdatedAt: 1,
          },
        ]);
        vi.spyOn(services.databaseService, "upsertLinkedIdentity").mockResolvedValue();
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/identities/unlink", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({ identityId: "identity-1" }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
    });
  });

  describe("/api/individual-tracker/streamer-view", () => {
    it("GET /api/individual-tracker/streamer-view returns 200 with stored settings", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerProfile").mockResolvedValue({
          ProfileId: "profile-1",
          UserId: "user-123",
          ActiveIdentityId: null,
          Name: "default",
          IdleTimeoutHours: 1,
          AllowContinueAfterLogout: 0,
          CreatedAt: 1,
          UpdatedAt: 1,
        });
        vi.spyOn(services.databaseService, "getStreamerViewSettings").mockResolvedValue({
          ProfileId: "profile-1",
          LayoutOptionsJson: JSON.stringify({ viewMode: "streamer" }),
          VisibleSectionsJson: JSON.stringify({ showTicker: true }),
          StyleFlagsJson: JSON.stringify({ colorMode: "observer" }),
          UpdatedAt: 123,
        });
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/streamer-view?profileId=profile-1", {
        method: "GET",
        headers: { cookie: "auth-session=valid-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        profileId: "profile-1",
        layoutOptions: { viewMode: "streamer" },
        visibleSections: { showTicker: true },
        styleFlags: { colorMode: "observer" },
        updatedAt: 123,
      });
    });

    it("PATCH /api/individual-tracker/streamer-view upserts merged settings", async () => {
      const upsertStreamerViewSettingsSpy = vi.fn();

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        vi.spyOn(services.databaseService, "getIndividualTrackerProfile").mockResolvedValue({
          ProfileId: "profile-1",
          UserId: "user-123",
          ActiveIdentityId: null,
          Name: "default",
          IdleTimeoutHours: 1,
          AllowContinueAfterLogout: 0,
          CreatedAt: 1,
          UpdatedAt: 1,
        });
        vi.spyOn(services.databaseService, "getStreamerViewSettings").mockResolvedValue({
          ProfileId: "profile-1",
          LayoutOptionsJson: JSON.stringify({ viewMode: "standard" }),
          VisibleSectionsJson: JSON.stringify({ showTicker: true }),
          StyleFlagsJson: JSON.stringify({ colorMode: "observer" }),
          UpdatedAt: 111,
        });
        vi.spyOn(services.databaseService, "upsertStreamerViewSettings").mockImplementation(async (row) => {
          upsertStreamerViewSettingsSpy(row);
          return Promise.resolve();
        });
        return services;
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/api/individual-tracker/streamer-view", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
        body: JSON.stringify({
          profileId: "profile-1",
          layoutOptions: { viewMode: "streamer" },
          visibleSections: { showTabs: false },
        }),
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<{
        profileId: string;
        layoutOptions: { viewMode: string };
        visibleSections: { showTicker: boolean; showTabs: boolean };
      }>();

      expect(body.profileId).toBe("profile-1");
      expect(body.layoutOptions.viewMode).toBe("streamer");
      expect(body.visibleSections.showTicker).toBe(true);
      expect(body.visibleSections.showTabs).toBe(false);
      expect(upsertStreamerViewSettingsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /proxy/halo-infinite", () => {
    it("returns 401 if x-proxy-auth header is missing", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 if x-proxy-auth header is invalid", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": "wrong-token",
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 if x-proxy-auth header is invalid even with a valid session cookie", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": "wrong-token",
          cookie: "auth-session=valid-token",
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 with no authentication and no session cookie", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 with expired session cookie", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json", cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 200 and rotates session cookie when expired session is refreshed", async () => {
      const fakeClient = aFakeHaloInfiniteClient();
      vi.mocked(AutoTokenProvider).mockClear();
      vi.mocked(HaloInfiniteClient).mockClear();
      vi.mocked(HaloInfiniteClient).mockImplementation(function () {
        return fakeClient;
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "expired-access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        vi.spyOn(services.authService, "refreshSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "fresh-access-token",
          refreshToken: "fresh-refresh-token",
          expiresAt: Date.now() + 3600000,
          issuedAt: Date.now(),
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: { "content-type": "application/json", cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=");

      expect(vi.mocked(AutoTokenProvider)).toHaveBeenCalledTimes(1);
      const tokenProviderFactory = vi.mocked(AutoTokenProvider).mock.calls[0]?.[0];
      expect(typeof tokenProviderFactory).toBe("function");

      if (tokenProviderFactory === undefined) {
        throw new Error("Expected AutoTokenProvider to be called with a token factory");
      }

      const token = await tokenProviderFactory();
      expect(token).toBe("fresh-access-token");
    });

    it("returns 401 when session is expired and refresh fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "expired-access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: { "content-type": "application/json", cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("returns 200 and result with valid session cookie", async () => {
      const fakeClient = aFakeHaloInfiniteClient();
      vi.mocked(AutoTokenProvider).mockClear();
      vi.mocked(HaloInfiniteClient).mockClear();
      vi.mocked(HaloInfiniteClient).mockImplementation(function () {
        return fakeClient;
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: {
          xuid: "0000000000001",
          gamerpic: {
            small: "small01.png",
            medium: "medium01.png",
            large: "large01.png",
            xlarge: "xlarge01.png",
          },
          gamertag: "gamertag01",
        },
      });

      expect(vi.mocked(AutoTokenProvider)).toHaveBeenCalledTimes(1);
      const tokenProviderFactory = vi.mocked(AutoTokenProvider).mock.calls[0]?.[0];
      expect(typeof tokenProviderFactory).toBe("function");

      if (tokenProviderFactory === undefined) {
        throw new Error("Expected AutoTokenProvider to be called with a token factory");
      }

      const token = await tokenProviderFactory();
      expect(token).toBe("access-token");
    });

    it("returns 400 with invalid JSON", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: "{not-json}",
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid JSON body");
    });

    it("returns 400 with invalid request format", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ foo: "bar" }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid request format");
    });

    it("returns 403 if method is not in allowlist", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "notARealMethod", args: [] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("Method not allowed");
    });

    it("returns 200 and result for valid method", async () => {
      vi.mocked(AutoTokenProvider).mockClear();
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: {
          xuid: "0000000000001",
          gamerpic: {
            small: "small01.png",
            medium: "medium01.png",
            large: "large01.png",
            xlarge: "xlarge01.png",
          },
          gamertag: "gamertag01",
        },
      });

      expect(vi.mocked(AutoTokenProvider)).not.toHaveBeenCalled();
    });

    it("returns 500 and error details if the method throws", async () => {
      const localHaloInfiniteClient = aFakeHaloInfiniteClient();
      vi.spyOn(localHaloInfiniteClient, "getUser").mockRejectedValue(new Error("fail!"));
      const localInstallServices = vi.fn<typeof installServices>(() => ({
        ...installFakeServicesWith({ env }),
        haloInfiniteClient: localHaloInfiniteClient,
      }));
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toHaveProperty("message", "fail!");
      expect(body).toHaveProperty("stack");
      expect(body).toHaveProperty("name", "Error");
    });
  });

  describe("POST /interactions", () => {
    it("returns 401 when Discord verification fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        const mockVerifyDiscordRequest = vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: false,
          rawBody: "invalid-body",
        });
        return { ...services, verifyDiscordRequest: mockVerifyDiscordRequest };
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify({ type: 1 }),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "invalid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Bad request signature.");
    });

    it("handles PING interaction successfully", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: true,
          interaction: pingInteraction,
          rawBody: JSON.stringify(pingInteraction),
        });
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify(pingInteraction),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("type", InteractionType.Ping);
    });

    it("returns 500 on internal error", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockRejectedValue(new Error("Internal failure"));
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify({ type: 1 }),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe("Internal error");
    });

    it("calls waitUntil when jobToComplete is provided", async () => {
      const jobToCompleteMock = vi.fn(async () => {
        // Empty implementation
      });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: true,
          interaction: pingInteraction,
          rawBody: JSON.stringify(pingInteraction),
        });
        vi.spyOn(services.discordService, "handleInteraction").mockReturnValue({
          response: new Response(JSON.stringify({ type: 1 })),
          jobToComplete: jobToCompleteMock,
        });
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify(pingInteraction),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const waitUntilSpy = vi.fn();
      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: waitUntilSpy,
        passThroughOnException: vi.fn(),
      };

      await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>);
      expect(waitUntilSpy).toHaveBeenCalledWith(expect.any(Promise));
    });
  });

  describe("POST /neatqueue", () => {
    it("returns 401 when verification fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.neatQueueService, "verifyRequest").mockResolvedValue({
          isValid: false,
          rawBody: "invalid-body",
        });
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/neatqueue", {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
        headers: {
          "content-type": "application/json",
          "x-neatqueue-signature": "invalid-signature",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Bad request signature.");
    });

    it("returns 500 on internal error", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.neatQueueService, "verifyRequest").mockRejectedValue(new Error("Internal failure"));
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/neatqueue", {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
        headers: {
          "content-type": "application/json",
          "x-neatqueue-signature": "valid-signature",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe("Internal error");
    });
  });

  describe("GET /ws/tracker/:guildId/:queueNumber", () => {
    it("returns 400 when queueNumber is not a valid number", async () => {
      const req = new Request("http://localhost/ws/tracker/guild123/notanumber", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid queue number");
    });

    it("returns 500 on internal error", async () => {
      const fakeEnv = aFakeEnvWith();

      vi.spyOn(fakeEnv.LIVE_TRACKER_DO, "idFromName").mockImplementation(() => {
        throw new Error("DO error");
      });

      const req = new Request("http://localhost/ws/tracker/guild123/42", { method: "GET" });
      const res = (await server.router.fetch(req, fakeEnv)) as Response;
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe("Internal Server Error");
    });
  });

  describe("GET /ws/individual-tracker/:userId/active", () => {
    it("forwards to the active tracker durable object instead of treating active as a trackerId", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findIndividualTrackerActiveSession").mockResolvedValue(
          aFakeIndividualTrackerActiveSessionsRow({
            UserId: "user-123",
            TrackerId: "tracker-123",
          }),
        );
        return services;
      });

      const doFetch = vi.fn(async () => Promise.resolve(new Response(null, { status: 200 })));
      const idFromNameSpy = vi.fn(() => env.INDIVIDUAL_TRACKER_DO.idFromName("active-websocket-stub"));

      const namespacePrototype = Object.getPrototypeOf(env.INDIVIDUAL_TRACKER_DO) as object | null;
      const individualTrackerNamespace = Object.assign(
        Object.create(namespacePrototype) as DurableObjectNamespace<IndividualTrackerDO>,
        env.INDIVIDUAL_TRACKER_DO,
        {
          idFromName: idFromNameSpy,
          get: () =>
            ({
              __DURABLE_OBJECT_BRAND: undefined as never,
              fetch: doFetch,
              id: env.INDIVIDUAL_TRACKER_DO.idFromName("active-websocket-stub"),
              connect: vi.fn(),
            }) as DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded,
        },
      );

      const envWithActiveTrackerStub = aFakeEnvWith({
        INDIVIDUAL_TRACKER_DO: individualTrackerNamespace,
      });

      server = new Server({ router: AutoRouter(), installServices: localInstallServices, getCommands });

      const req = new Request("http://localhost/ws/individual-tracker/user-123/active", { method: "GET" });
      const res = (await server.router.fetch(req, envWithActiveTrackerStub)) as Response;

      expect(res.status).toBe(200);
      expect(idFromNameSpy).toHaveBeenCalledWith("user-123:tracker-123");
      expect(idFromNameSpy).not.toHaveBeenCalledWith("user-123:active");
      expect(doFetch).toHaveBeenCalledOnce();
    });
  });
});
