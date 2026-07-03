import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
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
import type { Services } from "../../../services/install";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function wsRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { Upgrade: "websocket" } });
}

function makeFakeWebSocket(): WebSocket {
  const listeners = new Map<string, EventListener[]>();

  return {
    accept: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const existing = listeners.get(type) ?? [];
      listeners.set(type, [...existing, listener]);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const existing = listeners.get(type) ?? [];
      listeners.set(
        type,
        existing.filter((candidate) => candidate !== listener),
      );
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const existing = listeners.get(event.type) ?? [];
      for (const listener of existing) {
        listener(event);
      }
      return true;
    }),
    readyState: 1,
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
      expect(body.liveTrackerId).toBeNull();
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
      expect(body.liveTrackerId).toBe("t-active");
    });

    it("returns full tracker view payload and live metadata from DO state", async () => {
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

      expect.assertions(6);
      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.trackers).toHaveLength(1);
      expect(body.liveTrackerId).toBe("t1");
      const [entry] = body.trackers;
      if (entry != null) {
        expect(entry.isLive).toBe(true);
        expect(entry.matches).toHaveLength(3);
        expect(entry.gamertag).toBe("LivePlayer");
      }
    });

    it("returns empty matches when DO has no state", async () => {
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

      expect.assertions(4);
      expect(res.status).toBe(200);
      const body = await res.json<TrackerDirectoryResponse>();
      expect(body.liveTrackerId).toBeNull();
      const [entry] = body.trackers;
      if (entry != null) {
        expect(entry.matches).toEqual([]);
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
    it("pushes updated directory messages when live tracker changes", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "LiveSwitchTag" });
      const trackerOneLive = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });
      const trackerTwo = aFakeIndividualTrackersRow({
        TrackerId: "t2",
        UserId: "user-1",
        Status: "active",
        IsLive: 0,
      });
      const trackerTwoLive = aFakeIndividualTrackersRow({
        TrackerId: "t2",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });

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

      let pollCallback: (() => void) | undefined;
      vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
        pollCallback = callback;
        return 1 as unknown as NodeJS.Timeout;
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        // First call builds initial payload, second call builds tracker subscriptions,
        // third call (poll) returns t2 as live.
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
          .mockResolvedValueOnce([trackerOneLive, trackerTwo])
          .mockResolvedValueOnce([trackerOneLive, trackerTwo])
          .mockResolvedValueOnce([trackerTwo, trackerTwoLive]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/LiveSwitchTag/ws"), env)) as Response;
      expect(res.status).toBe(101);

      const serverMocks = capturedServer as unknown as Record<string, ReturnType<typeof vi.fn>> | undefined;
      const sendMock = serverMocks?.["send"];
      expect(sendMock).toHaveBeenCalledOnce();

      // Check that initial state has t1 as live
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const firstPayload = sendMock?.mock.calls[0]?.[0];
      const firstMessage = trackerDirectoryMessageContract.parse(firstPayload as string);
      expect(firstMessage.directory.liveTrackerId).toBe("t1");

      expect(pollCallback).toBeDefined();
      pollCallback?.();
      await vi.waitFor(() => {
        expect(sendMock).toHaveBeenCalledTimes(2);
      });

      // Should now have 2 sends (initial + updated)
      expect(sendMock).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const secondPayload = sendMock?.mock.calls[1]?.[0];
      const secondMessage = trackerDirectoryMessageContract.parse(secondPayload as string);
      expect(secondMessage.directory.liveTrackerId).toBe("t2");
    });

    it("pushes an updated directory immediately when a tracker websocket message arrives", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "ImmediatePushTag" });
      const trackerRow = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });

      let capturedServer: WebSocket | undefined;
      const client = makeFakeWebSocket();
      const server = makeFakeWebSocket();
      const trackerSocket = makeFakeWebSocket();
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
            if (init?.webSocket != null) {
              Object.defineProperty(this, "webSocket", { value: init.webSocket });
            }
          }
        },
      );

      const doStub = {
        fetch: vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const parsedUrl = new URL(url);

          if (parsedUrl.pathname === "/websocket") {
            return Promise.resolve(new Response(null, { status: 101, webSocket: trackerSocket }));
          }

          return Promise.resolve(
            new Response(JSON.stringify({ state: aFakeIndividualTrackerViewStateWith({ trackerId: "t1" }) }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }),
        connect: (): Socket => {
          throw new Error("Socket connections not supported in fake");
        },
        id: {
          toString: (): string => "fake-do-id",
          equals: (): boolean => true,
        },
        __DURABLE_OBJECT_BRAND: undefined as never,
      };

      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
          .mockResolvedValueOnce([trackerRow])
          .mockResolvedValueOnce([trackerRow])
          .mockResolvedValueOnce([trackerRow]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(wsRequest("/u/ImmediatePushTag/ws"), localEnv)) as Response;
      expect(res.status).toBe(101);

      const serverMocks = capturedServer as unknown as Record<string, ReturnType<typeof vi.fn>> | undefined;
      const sendMock = serverMocks?.["send"];
      expect(sendMock).toHaveBeenCalledTimes(1);

      trackerSocket.dispatchEvent(new Event("message"));

      await vi.waitFor(() => {
        expect(sendMock).toHaveBeenCalledTimes(2);
      });
    });

    it("schedules another push when tracker updates arrive during a pending push", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "QueuedPushTag" });
      const trackerRowLive = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });
      const trackerRowPaused = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Status: "paused",
        IsLive: 0,
      });

      let resolvePendingRows: ((rows: (typeof trackerRowPaused)[]) => void) | undefined;
      const pendingRowsPromise = new Promise<(typeof trackerRowPaused)[]>((resolve) => {
        resolvePendingRows = resolve;
      });
      let findTrackersSpy: MockInstance<Services["databaseService"]["findIndividualTrackersByUserId"]> | undefined;

      let capturedServer: WebSocket | undefined;
      const client = makeFakeWebSocket();
      const server = makeFakeWebSocket();
      const trackerSocket = makeFakeWebSocket();
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
            if (init?.webSocket != null) {
              Object.defineProperty(this, "webSocket", { value: init.webSocket });
            }
          }
        },
      );

      const doStub = {
        fetch: vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const parsedUrl = new URL(url);

          if (parsedUrl.pathname === "/websocket") {
            return Promise.resolve(new Response(null, { status: 101, webSocket: trackerSocket }));
          }

          return Promise.resolve(
            new Response(JSON.stringify({ state: aFakeIndividualTrackerViewStateWith({ trackerId: "t1" }) }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }),
        connect: (): Socket => {
          throw new Error("Socket connections not supported in fake");
        },
        id: {
          toString: (): string => "fake-do-id",
          equals: (): boolean => true,
        },
        __DURABLE_OBJECT_BRAND: undefined as never,
      };

      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        findTrackersSpy = vi
          .spyOn(services.databaseService, "findIndividualTrackersByUserId")
          .mockResolvedValueOnce([trackerRowLive])
          .mockResolvedValueOnce([trackerRowLive])
          .mockImplementationOnce(async () => pendingRowsPromise)
          .mockResolvedValueOnce([trackerRowLive]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as unknown as NodeJS.Timeout);

      const res = (await router.fetch(wsRequest("/u/QueuedPushTag/ws"), localEnv)) as Response;
      expect(res.status).toBe(101);

      const serverMocks = capturedServer as unknown as Record<string, ReturnType<typeof vi.fn>> | undefined;
      const sendMock = serverMocks?.["send"];
      expect(sendMock).toHaveBeenCalledTimes(1);

      await vi.waitFor(() => {
        expect(findTrackersSpy?.mock.calls).toHaveLength(2);
      });

      trackerSocket.dispatchEvent(new Event("message"));
      trackerSocket.dispatchEvent(new Event("message"));
      resolvePendingRows?.([trackerRowPaused]);

      await vi.waitFor(() => {
        expect(sendMock).toHaveBeenCalledTimes(3);
      });

      const firstMessage = trackerDirectoryMessageContract.parse(sendMock?.mock.calls[0]?.[0] as string);
      const secondMessage = trackerDirectoryMessageContract.parse(sendMock?.mock.calls[1]?.[0] as string);
      const thirdMessage = trackerDirectoryMessageContract.parse(sendMock?.mock.calls[2]?.[0] as string);
      expect(firstMessage.directory.liveTrackerId).toBe("t1");
      expect(secondMessage.directory.liveTrackerId).toBeNull();
      expect(thirdMessage.directory.liveTrackerId).toBe("t1");
    });

    it("logs background subscription setup failures without breaking the handshake", async () => {
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "BrokenSetupTag" });
      const trackerRow = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Status: "active",
        IsLive: 1,
      });

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

      const setupError = new Error("subscription setup failed");
      let errorSpy: MockInstance<Services["logService"]["error"]> | undefined;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        errorSpy = vi.spyOn(services.logService, "error");
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
          .mockResolvedValueOnce([trackerRow])
          .mockRejectedValueOnce(setupError);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as unknown as NodeJS.Timeout);

      const res = (await router.fetch(wsRequest("/u/BrokenSetupTag/ws"), env)) as Response;

      expect(res.status).toBe(101);
      const serverMocks = capturedServer as unknown as Record<string, ReturnType<typeof vi.fn>> | undefined;
      expect(serverMocks?.["send"]).toHaveBeenCalledOnce();

      await vi.waitFor(() => {
        expect(errorSpy?.mock.calls).toHaveLength(1);
        expect(errorSpy?.mock.calls[0]?.[0]).toBe(setupError);
        expect(errorSpy?.mock.calls[0]?.[1]).toEqual(expect.any(Map));
      });
    });

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

    it("does not request pre-series player info while building follow directories", async () => {
      const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
      const fetchSpy = vi.spyOn(doStub, "fetch");
      const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });
      const identity = aFakeLinkedIdentitiesRow({ UserId: "user-1", Gamertag: "NoPreSeriesTag" });
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active", IsLive: 1 });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env: localEnv });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(identity);
        vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([row]);
        return services;
      });
      individualTrackerRoutesRegisterHandler(router, localInstallServices);

      const res = (await router.fetch(getRequest("/u/NoPreSeriesTag/view"), localEnv)) as Response;

      expect(res.status).toBe(200);
      const call = fetchSpy.mock.calls[0]?.[0];
      const rawUrl = typeof call === "string" ? call : call instanceof URL ? call.toString() : call?.url;
      const parsedUrl = new URL(rawUrl ?? "http://do/view-state");
      expect(parsedUrl.searchParams.get("includePreSeriesPlayerInfo")).toBeNull();
    });
  });
});
