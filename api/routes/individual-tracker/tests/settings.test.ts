import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { SettingsResponse } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import type { ErrorResponse } from "@guilty-spark/shared/contracts/error";
import type { DatabaseService } from "../../../services/database/database";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function patchRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/individual-tracker settings routes", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  describe("GET /api/individual-tracker/:trackerId/settings", () => {
    it("returns 401 when not authenticated", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/tracker-1/settings"), env)) as Response;

      expect(res.status).toBe(401);
    });

    it("returns 404 when tracker does not exist", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/unknown/settings"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns 404 when tracker belongs to a different user", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "other-user" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/tracker-1/settings"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns current settings for the tracker owner", async () => {
      const row = aFakeIndividualTrackersRow({
        TrackerId: "tracker-1",
        UserId: "user-1",
        StreamerViewSettingsJson: JSON.stringify({ styleFlags: { teamColor: "#ff0000" } }),
      });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/tracker-1/settings"), env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings.styleFlags?.teamColor).toBe("#ff0000");
    });

    it("returns empty settings when none have been stored", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "user-1" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/tracker-1/settings"), env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings).toEqual({});
    });
  });

  describe("PATCH /api/individual-tracker/:trackerId/settings", () => {
    it("returns 401 when not authenticated", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(patchRequest("/api/individual-tracker/tracker-1/settings", {}), env)) as Response;

      expect(res.status).toBe(401);
    });

    it("returns 404 when tracker does not exist", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(patchRequest("/api/individual-tracker/unknown/settings", {}), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns 404 when tracker belongs to a different user", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "other-user" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(patchRequest("/api/individual-tracker/tracker-1/settings", {}), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns 400 for an invalid body", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "user-1" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-1" }));
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(
        patchRequest("/api/individual-tracker/tracker-1/settings", { settings: { styleFlags: { teamColor: 12345 } } }),
        env,
      )) as Response;

      expect(res.status).toBe(400);
      const body = await res.json<ErrorResponse>();
      expect(body.error).toBe("Invalid settings payload");
    });

    it("updates settings and returns the new settings", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "tracker-1", UserId: "user-1" });
      const sharedServices = installFakeServicesWith({ env });
      const updateSpy: MockInstance<DatabaseService["updateIndividualTrackerSettings"]> = vi.spyOn(
        sharedServices.databaseService,
        "updateIndividualTrackerSettings",
      );
      updateSpy.mockResolvedValue(undefined);
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        vi.spyOn(sharedServices.authService, "validateSession").mockResolvedValue(
          aFakeAuthSessionWith({ userId: "user-1" }),
        );
        vi.spyOn(sharedServices.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return sharedServices;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const newSettings = { styleFlags: { teamColor: "#00ff00", enemyColor: "#ff0000" } };
      const res = (await router.fetch(
        patchRequest("/api/individual-tracker/tracker-1/settings", { settings: newSettings }),
        env,
      )) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings.styleFlags?.teamColor).toBe("#00ff00");
      expect(body.settings.styleFlags?.enemyColor).toBe("#ff0000");
      const [, settingsJson] = updateSpy.mock.calls[0] ?? [];
      expect(JSON.parse(settingsJson ?? "{}")).toStrictEqual(newSettings);
    });
  });
});
