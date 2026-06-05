import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerViewStateWith,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { Upgrade: "websocket" } });
}

describe("/api/individual-tracker/xuid view-by-xuid route", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 404 when no trackers are found for the xuid", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([]);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/xuid/9999/view"), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 200 and prefers the live row when multiple rows exist for the same xuid", async () => {
    const stoppedRow = aFakeIndividualTrackersRow({ TrackerId: "t-stopped", UserId: "user-1", IsLive: 0 });
    const liveRow = aFakeIndividualTrackersRow({
      TrackerId: "t-live",
      UserId: "user-1",
      Gamertag: "LiveTag",
      Status: "active",
      IsLive: 1,
    });

    const doStub = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t-live",
          status: "active",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: null,
          matches: [],
          series: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([stoppedRow, liveRow]);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      getRequest("/api/individual-tracker/xuid/2533274000000001/view"),
      localEnv,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.trackerId).toBe("t-live");
    expect(body.view.gamertag).toBe("LiveTag");
    expect(body.view.isLive).toBe(true);
  });

  it("falls back to the first row when no live row exists", async () => {
    const row = aFakeIndividualTrackersRow({
      TrackerId: "t1",
      UserId: "user-1",
      Gamertag: "OfflineTag",
      Status: "stopped",
      IsLive: 0,
    });

    const doStub = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          status: "stopped",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: null,
          matches: [],
          series: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([row]);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      getRequest("/api/individual-tracker/xuid/2533274000000001/view"),
      localEnv,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.trackerId).toBe("t1");
    expect(body.view.isLive).toBe(false);
  });

  describe("ws", () => {
    it("returns 404 for an unknown xuid", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/api/individual-tracker/xuid/9999/ws"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("forwards the websocket upgrade to the DO for a known xuid", async () => {
      const doStub = aFakeIndividualTrackerDOWith();
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", IsLive: 1 });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(
        wsRequest("/api/individual-tracker/xuid/2533274000000001/ws"),
        localEnv,
      )) as Response;

      expect(res.headers.get("x-fake-upgrade")).toBe("websocket");
    });

    it("returns 426 when the request is not a websocket upgrade", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findIndividualTrackersByXuids").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/xuid/2533274000000001/ws"), env)) as Response;

      expect(res.status).toBe(426);
    });
  });
});
