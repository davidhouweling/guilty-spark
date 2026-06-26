import type { AutoRouterType } from "itty-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerDirectoryResponse } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { trackerDirectoryMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerViewStateWith,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow, aFakeLinkedIdentitiesRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { Upgrade: "websocket" } });
}

function makeFakeWebSocket(): WebSocket {
  return {
    accept: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    readyState: 0,
  } as unknown as WebSocket;
}

describe("/u/:gamertag follow routes", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();

    const client = makeFakeWebSocket();
    const server = makeFakeWebSocket();
    vi.stubGlobal("WebSocketPair", function () {
      return { 0: client, 1: server };
    });
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

    it("returns 200 with empty trackers array when user has no active trackers", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "KnownTag" });
      const stoppedTracker = aFakeIndividualTrackersRow({ UserId: "user-1", Status: "stopped" });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([stoppedTracker]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/KnownTag/view"), env)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.trackers).toEqual([]);
    });

    it("includes active and paused trackers but excludes stopped trackers", async () => {
      const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "MultiTag" });
      const activeTracker = aFakeIndividualTrackersRow({
        TrackerId: "t-active",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });
      const pausedTracker = aFakeIndividualTrackersRow({
        TrackerId: "t-paused",
        UserId: "user-1",
        Status: "paused",
        IsLive: 0,
      });
      const stoppedTracker = aFakeIndividualTrackersRow({
        TrackerId: "t-stopped",
        UserId: "user-1",
        Status: "stopped",
        IsLive: 0,
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
          activeTracker,
          pausedTracker,
          stoppedTracker,
        ]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/MultiTag/view"), localEnv)) as Response;

      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.trackers).toHaveLength(2);
      const trackerIds = body.trackers.map((t) => t.trackerId);
      expect(trackerIds).toContain("t-active");
      expect(trackerIds).toContain("t-paused");
      expect(trackerIds).not.toContain("t-stopped");
    });

    it("returns correct accumulated counts and isLive flag from DO state", async () => {
      const doStub = aFakeIndividualTrackerDOWith({
        viewStateResponse: {
          state: aFakeIndividualTrackerViewStateWith({
            trackerId: "t1",
            matches: [
              {
                matchId: "m1",
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
              {
                matchId: "m2",
                startTime: "2024-11-26T11:15:00.000Z",
                endTime: "2024-11-26T11:25:00.000Z",
                mapAssetId: "map-1",
                mapVersionId: "map-v-1",
                mapName: "Aquarius",
                mapBackgroundUrl: "https://example.com/maps/aquarius.jpg",
                modeAssetId: "mode-1",
                gameVariantCategory: 6,
                outcome: "Loss",
                score: "40:50",
                isMatchmaking: false,
              },
              {
                matchId: "m3",
                startTime: "2024-11-26T11:30:00.000Z",
                endTime: "2024-11-26T11:40:00.000Z",
                mapAssetId: "map-1",
                mapVersionId: "map-v-1",
                mapName: "Aquarius",
                mapBackgroundUrl: "https://example.com/maps/aquarius.jpg",
                modeAssetId: "mode-1",
                gameVariantCategory: 6,
                outcome: "Tie",
                score: "50:50",
                isMatchmaking: false,
              },
            ],
          }),
        },
      });
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "LivePlayer" });
      const row = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "LivePlayer",
        Status: "active",
        IsLive: 1,
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/LivePlayer/view"), localEnv)) as Response;

      expect.assertions(8);
      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.trackers).toHaveLength(1);
      const [entry] = body.trackers;
      if (entry != null) {
        expect(entry.isLive).toBe(true);
        expect(entry.accumulated.total).toBe(3);
        expect(entry.accumulated.wins).toBe(1);
        expect(entry.accumulated.losses).toBe(1);
        expect(entry.accumulated.ties).toBe(1);
        expect(entry.gamertag).toBe("LivePlayer");
      }
    });

    it("returns zeros for accumulated when DO has no state", async () => {
      const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "PausedPlayer" });
      const row = aFakeIndividualTrackersRow({
        TrackerId: "t2",
        UserId: "user-1",
        Gamertag: "PausedPlayer",
        Status: "paused",
        IsLive: 0,
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/PausedPlayer/view"), localEnv)) as Response;

      expect.assertions(6);
      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      const [entry] = body.trackers;
      if (entry != null) {
        expect(entry.accumulated.total).toBe(0);
        expect(entry.accumulated.wins).toBe(0);
        expect(entry.accumulated.losses).toBe(0);
        expect(entry.accumulated.ties).toBe(0);
        expect(entry.isLive).toBe(false);
      }
    });

    it("includes streamerSettings when getSettingsForView returns non-empty settings", async () => {
      const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "SettingsPlayer" });
      const row = aFakeIndividualTrackersRow({ TrackerId: "t3", UserId: "user-1", Status: "active" });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([row]);
        vi.spyOn(services.individualTrackerService, "getSettingsForView").mockResolvedValue({
          layoutOptions: { viewMode: "wide" },
        });
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/SettingsPlayer/view"), localEnv)) as Response;

      expect.assertions(3);
      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.streamerSettings).toBeDefined();
      expect(body.streamerSettings?.layoutOptions?.viewMode).toBe("wide");
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

    it("returns 101 with empty trackers array when user has no active trackers", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "EmptyWsTag" });
      const stoppedTracker = aFakeIndividualTrackersRow({ UserId: "user-1", Status: "stopped" });

      let capturedServer: WebSocket | undefined;
      const client = makeFakeWebSocket();
      const server = makeFakeWebSocket();
      vi.stubGlobal("WebSocketPair", function () {
        capturedServer = server;
        return { 0: client, 1: server };
      });

      const OriginalResponse = globalThis.Response;
      vi.stubGlobal(
        "Response",
        class FakeResponse extends OriginalResponse {
          constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
            super(body, { ...init, status: init?.status === 101 ? 200 : (init?.status ?? 200) });
            if (init?.status === 101) {
              Object.defineProperty(this, "status", { value: 101 });
            }
          }
        },
      );

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([stoppedTracker]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/EmptyWsTag/ws"), env)) as Response;

      expect.assertions(4);
      expect(res.status).toBe(101);
      const serverMocks = capturedServer as unknown as Record<string, ReturnType<typeof vi.fn>> | undefined;
      const sendMock = serverMocks?.["send"];
      expect(sendMock).toHaveBeenCalledOnce();
      expect(sendMock).toHaveBeenCalledWith(expect.any(String));
      const msg = trackerDirectoryMessageContract.parse(sendMock?.mock.calls[0]?.[0] as string);
      expect(msg.directory.trackers).toEqual([]);
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

    it("returns 101 and sends initial directory message on upgrade", async () => {
      const doStub = aFakeIndividualTrackerDOWith({
        viewStateResponse: {
          state: aFakeIndividualTrackerViewStateWith({
            trackerId: "t1",
            matches: [],
          }),
        },
      });
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "WsPlayer" });
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active", IsLive: 1 });

      let capturedServer: WebSocket | undefined;
      const client = makeFakeWebSocket();
      const server = makeFakeWebSocket();
      vi.stubGlobal("WebSocketPair", function () {
        capturedServer = server;
        return { 0: client, 1: server };
      });

      const OriginalResponse = globalThis.Response;
      vi.stubGlobal(
        "Response",
        class FakeResponse extends OriginalResponse {
          constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
            super(body, { ...init, status: init?.status === 101 ? 200 : (init?.status ?? 200) });
            if (init?.status === 101) {
              Object.defineProperty(this, "status", { value: 101 });
            }
          }
        },
      );

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/WsPlayer/ws"), localEnv)) as Response;

      expect.assertions(5);
      expect(res.status).toBe(101);

      type MockRecord = Record<string, ReturnType<typeof vi.fn>>;
      const serverMocks = capturedServer as unknown as MockRecord | undefined;
      const acceptMock = serverMocks?.["accept"];
      const sendMock = serverMocks?.["send"];
      expect(acceptMock).toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledOnce();
      const firstCall = sendMock?.mock.calls[0] as unknown[] | undefined;
      const [sentArg] = firstCall ?? [];
      expect(typeof sentArg).toBe("string");
      const msg = trackerDirectoryMessageContract.parse(sentArg as string);
      expect(msg.type).toBe("directory");
    });
  });
});
