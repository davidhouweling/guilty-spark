import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerViewStateWith,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
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

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { Upgrade: "websocket" } });
}

describe("/api/individual-tracker view route", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 401 for /view when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t1/view"), env)) as Response;

    expect(res.status).toBe(401);
  });

  it("returns 404 when the tracker does not exist", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/unknown/view"), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 200 with the view for the owning authenticated user", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          status: "active",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
          matches: [
            {
              matchId: "match-1",
              startTime: "2024-11-26T11:00:00.000Z",
              endTime: "2024-11-26T11:10:00.000Z",
              mapAssetId: "map-1",
              mapVersionId: "map-v-1",
              mapName: "Aquarius",
              mapBackgroundUrl: "https://example.com/maps/aquarius.jpg",
              modeAssetId: "mode-1",
              gameVariantCategory: 6,
              outcome: "Win",
              score: "50:42",
              isMatchmaking: false,
            },
          ],
          series: [
            {
              id: "series:match-1:match-2",
              matchIds: ["match-1", "match-2"],
              matchBackgroundUrls: ["https://example.com/maps/aquarius.jpg", "https://example.com/maps/aquarius.jpg"],
              score: "2:1",
              title: "Eagle vs Cobra",
              subtitle: "Best of 3",
            },
          ],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t1",
      UserId: "user-123",
      Gamertag: "MyTag",
      Status: "active",
      IsLive: 1,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t1/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.trackerId).toBe("t1");
    expect(body.view.gamertag).toBe("MyTag");
    expect(body.view.status).toBe("active");
    expect(body.view.isLive).toBe(true);
    expect(body.view.matches).toHaveLength(1);
    expect(body.view.series[0]?.score).toBe("2:1");
    expect(body.view).not.toHaveProperty("userId");
    expect(body.view).not.toHaveProperty("xuid");
    expect(JSON.stringify(body)).not.toContain("user-123");
  });

  it("returns 404 for /view when authenticated user does not own the tracker", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(
        aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "another-user" }),
      );
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t1/view"), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 200 with empty matches when the DO has no state", async () => {
    const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t2",
      UserId: "user-123",
      Gamertag: "StoppedTag",
      Status: "stopped",
      IsLive: 0,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t2/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.status).toBe("stopped");
    expect(body.view.isLive).toBe(false);
    expect(body.view.matches).toEqual([]);
  });

  it("requests default stats highlight slots when settings omit explicit slots", async () => {
    const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const fetchSpy = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t-default-slots",
      UserId: "user-123",
      Gamertag: "DefaultSlotsTag",
      Status: "active",
      IsLive: 1,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({});
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t-default-slots/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const call = fetchSpy.mock.calls[0]?.[0];
    const rawUrl = typeof call === "string" ? call : call instanceof URL ? call.toString() : call?.url;
    const parsedUrl = new URL(rawUrl ?? "http://do/view-state");
    expect(parsedUrl.searchParams.get("statsHighlightSlots")).toBe(
      JSON.stringify(
        DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT),
      ),
    );
  });

  it("does not request stats highlight slots when settings explicitly disable them", async () => {
    const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const fetchSpy = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t-empty-slots",
      UserId: "user-123",
      Gamertag: "EmptySlotsTag",
      Status: "active",
      IsLive: 1,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = withAuth(installFakeServicesWith)({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
        visibleSections: {
          statsHighlightSlots: [],
        },
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t-empty-slots/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const call = fetchSpy.mock.calls[0]?.[0];
    const rawUrl = typeof call === "string" ? call : call instanceof URL ? call.toString() : call?.url;
    const parsedUrl = new URL(rawUrl ?? "http://do/view-state");
    expect(parsedUrl.searchParams.get("statsHighlightSlots")).toBeNull();
  });

  describe("ws", () => {
    it("returns 401 when not authenticated", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/api/individual-tracker/t1/ws"), env)) as Response;

      expect(res.status).toBe(401);
    });

    it("returns 404 for an unknown tracker", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/api/individual-tracker/unknown/ws"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("forwards the websocket upgrade to the DO for the owning authenticated user", async () => {
      const doStub = aFakeIndividualTrackerDOWith();
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env: localEnv });
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/api/individual-tracker/t1/ws"), localEnv)) as Response;

      expect(res.headers.get("x-fake-upgrade")).toBe("websocket");
    });

    it("returns 404 for /ws when authenticated user does not own the tracker", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "another-user" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/api/individual-tracker/t1/ws"), env)) as Response;

      expect(res.status).toBe(404);
    });

    it("returns 426 when the request is not a websocket upgrade", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = withAuth(installFakeServicesWith)({ env });
        vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/api/individual-tracker/t1/ws"), env)) as Response;

      expect(res.status).toBe(426);
    });
  });
});
