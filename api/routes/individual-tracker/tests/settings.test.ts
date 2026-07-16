import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsResponse } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeUserTrackerDOWith } from "../../../durable-objects/user-tracker/fakes/user-tracker-do.fake";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

const SESSION_USER_ID = "user-123";

function withAuth(installServicesFn: typeof installFakeServicesWith): typeof installFakeServicesWith {
  return (opts) => {
    const services = installServicesFn(opts);
    vi.spyOn(services.authService, "validateSession").mockResolvedValue(
      aFakeAuthSessionWith({ userId: SESSION_USER_ID }),
    );
    return services;
  };
}

describe("/api/individual-tracker/settings", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", { method: "GET" });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(401);
    });

    it("returns empty settings when the user has no saved settings", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.individualTrackerService, "getSettings").mockResolvedValue({});
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", { method: "GET" });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings).toEqual({});
    });

    it("returns parsed settings when the user has saved settings", async () => {
      const savedSettings = { styleFlags: { colorMode: "player" as const } };
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.individualTrackerService, "getSettings").mockResolvedValue(savedSettings);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", { method: "GET" });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings).toEqual(savedSettings);
    });
  });

  describe("PATCH", () => {
    it("returns 401 when not authenticated", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: {} }),
      });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(401);
    });

    it("returns 400 when the body is invalid", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() =>
        withAuth(installFakeServicesWith)({ env }),
      );
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { styleFlags: { colorMode: "not-a-valid-mode" } } }),
      });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(400);
    });

    it("updates and returns the new settings", async () => {
      const newSettings = { layoutOptions: { viewMode: "wide" as const } };
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.individualTrackerService, "updateSettings").mockResolvedValue(newSettings);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: newSettings }),
      });
      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<SettingsResponse>();
      expect(body.settings).toEqual(newSettings);
    });

    it("notifies the UserTrackerDO after saving settings", async () => {
      const newSettings = { styleFlags: { playerTeamColor: "cerulean" } };
      const fakeUserTrackerDO = aFakeUserTrackerDOWith();
      const fetchSpy = vi.spyOn(fakeUserTrackerDO, "fetch");
      const localEnv = aFakeEnvWith({
        USER_TRACKER_DO: aFakeDurableObjectNamespaceWith(fakeUserTrackerDO),
      });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env: localEnv });
        vi.spyOn(services.individualTrackerService, "updateSettings").mockResolvedValue(newSettings);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const req = new Request("http://localhost/api/individual-tracker/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: newSettings }),
      });
      const maybeResponse: unknown = await router.fetch(req, localEnv);
      if (!(maybeResponse instanceof Response)) {
        throw new Error("Expected Response");
      }
      const res = maybeResponse;

      expect(res.status).toBe(200);
      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const firstCallRequest = fetchSpy.mock.calls[0]?.[0];
      if (!(firstCallRequest instanceof Request)) {
        throw new Error("Expected Request");
      }

      expect(firstCallRequest.url).toContain("/settings-changed");
    });
  });
});
