import type { AutoRouterType } from "itty-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerDirectoryResponse } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { createApiRouter } from "../../../base/router";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeUserTrackerDOWith } from "../../../durable-objects/user-tracker/fakes/user-tracker-do.fake";
import { aFakeLinkedIdentitiesRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { Upgrade: "websocket" } });
}

function getRawUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe("/u/:gamertag follow routes", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET /u/:gamertag/view", () => {
    it("returns 404 when gamertag is not found", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/UnknownTag/view"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns the directory from UserTrackerDO and passes userId in the internal request", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "KnownTag" });
      const userTrackerDo = aFakeUserTrackerDOWith({
        viewStateResponse: {
          state: {
            userId: "user-1",
            lastUpdateTime: "2026-07-03T00:00:00.000Z",
            directory: {
              trackers: [
                {
                  trackerId: "t1",
                  gamertag: "KnownTag",
                  status: "active",
                  isLive: true,
                  matches: [],
                  series: [],
                  lastUpdateTime: "2026-07-03T00:00:00.000Z",
                  lastMatchDiscoveredAt: null,
                  hasActiveSeries: false,
                  hasRecentCompletedSeries: false,
                },
              ],
              liveTrackerId: "t1",
            },
          },
        },
      });
      const userTrackerFetchSpy = vi.spyOn(userTrackerDo, "fetch");
      const localEnv = aFakeEnvWith({ USER_TRACKER_DO: aFakeDurableObjectNamespaceWith(userTrackerDo) });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/KnownTag/view"), localEnv)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json<TrackerDirectoryResponse>()).resolves.toEqual({
        trackers: [
          {
            trackerId: "t1",
            gamertag: "KnownTag",
            status: "active",
            isLive: true,
            matches: [],
            series: [],
            lastUpdateTime: "2026-07-03T00:00:00.000Z",
            lastMatchDiscoveredAt: null,
            hasActiveSeries: false,
            hasRecentCompletedSeries: false,
          },
        ],
        liveTrackerId: "t1",
      });

      const rawUrl = getRawUrl(userTrackerFetchSpy.mock.calls[0]?.[0] ?? "http://do/view-state");
      const parsedUrl = new URL(rawUrl);
      expect(parsedUrl.pathname).toBe("/view-state");
      expect(parsedUrl.searchParams.get("userId")).toBe("user-1");
    });

    it("returns an empty directory when UserTrackerDO has not built state yet", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "EmptyTag" });
      const userTrackerDo = aFakeUserTrackerDOWith({ viewStateResponse: { state: null } });
      const localEnv = aFakeEnvWith({ USER_TRACKER_DO: aFakeDurableObjectNamespaceWith(userTrackerDo) });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/EmptyTag/view"), localEnv)) as Response;

      expect(res.status).toBe(200);
      await expect(res.json<TrackerDirectoryResponse>()).resolves.toEqual({ trackers: [], liveTrackerId: null });
    });
  });

  describe("GET /u/:gamertag/ws", () => {
    it("returns 404 when gamertag is not found", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/UnknownTag/ws"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns 426 when the request is not a websocket upgrade", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "SomeTag" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/SomeTag/ws"), env)) as Response;

      expect(res.status).toBe(426);
    });

    it("forwards websocket upgrades to UserTrackerDO and passes userId in the internal request", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "WsTag" });
      const userTrackerDo = aFakeUserTrackerDOWith();
      const userTrackerFetchSpy = vi.spyOn(userTrackerDo, "fetch");
      const localEnv = aFakeEnvWith({ USER_TRACKER_DO: aFakeDurableObjectNamespaceWith(userTrackerDo) });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/WsTag/ws"), localEnv)) as Response;

      expect(res.headers.get("x-fake-upgrade")).toBe("websocket");
      const call = userTrackerFetchSpy.mock.calls[0]?.[0];
      expect(call).toBeInstanceOf(Request);
      const request = call as Request;
      const parsedUrl = new URL(request.url);
      expect(parsedUrl.pathname).toBe("/websocket");
      expect(parsedUrl.searchParams.get("userId")).toBe("user-1");
      expect(request.headers.get("Upgrade")).toBe("websocket");
    });
  });
});
