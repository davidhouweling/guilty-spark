import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import { LiveTrackerIndividualDO } from "../live-tracker-individual-do.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { Services } from "../../../services/install.mjs";
import { DiscordError } from "../../../services/discord/discord-error.mjs";
import { apiMessage, guild } from "../../../services/discord/fakes/data.mjs";
import { aFakeDurableObjectId } from "../../fakes/live-tracker-do.fake.mjs";
import {
  aFakeLiveTrackerIndividualStateWith,
  aFakeDiscordTargetWith,
  aFakeWebSocketTargetWith,
} from "../fakes/data.mjs";
import type {
  LiveTrackerIndividualState,
  UpdateTarget,
  LiveTrackerIndividualSubscribeSuccessResponse,
  LiveTrackerIndividualSubscribeFailureResponse,
  LiveTrackerIndividualUnsubscribeSuccessResponse,
  LiveTrackerIndividualUnsubscribeFailureResponse,
  LiveTrackerIndividualTargetsResponse,
} from "../types.mjs";

const createMockWebSocket = (overrides: Partial<WebSocket> = {}): WebSocket => {
  return {
    send: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } satisfies Partial<WebSocket> as WebSocket;
};

const createMockSqlStorage = (): SqlStorage => {
  return {
    exec: vi.fn(),
    databaseSize: 0,
    Cursor: vi.fn() as never,
    Statement: vi.fn() as never,
  } as SqlStorage;
};

const createMockDurableObjectState = (): {
  durableObjectState: DurableObjectState;
  mocks: { storage: DurableObjectStorage };
} => {
  const mockStorage: DurableObjectStorage = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    setAlarm: vi.fn(),
    getAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
    getBookmarkForTime: vi.fn(),
    getCurrentBookmark: vi.fn(),
    list: vi.fn(),
    onNextSessionRestoreBookmark: vi.fn(),
    sql: createMockSqlStorage(),
    sync: vi.fn(),
    transaction: vi.fn(),
    transactionSync: vi.fn(),
    kv: {} satisfies Partial<DurableObjectStorage["kv"]> as DurableObjectStorage["kv"],
  };

  const mockDurableObjectState: DurableObjectState = {
    storage: mockStorage,
    props: {},
    exports: {} as Cloudflare.Exports,
    abort: () => void 0,
    acceptWebSocket: vi.fn(),
    blockConcurrencyWhile: async (cb) => cb(),
    getHibernatableWebSocketEventTimeout: () => 0,
    getTags: vi.fn(() => []),
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    getWebSockets: vi.fn(() => []),
    id: aFakeDurableObjectId(),
    setHibernatableWebSocketEventTimeout: () => void 0,
    setWebSocketAutoResponse: () => void 0,
    waitUntil: () => void 0,
  };

  return {
    durableObjectState: mockDurableObjectState,
    mocks: {
      storage: mockStorage,
    },
  };
};

describe("LiveTrackerIndividualDO - Broadcast System", () => {
  let durableObject: LiveTrackerIndividualDO;
  let stateMock: ReturnType<typeof createMockDurableObjectState>;
  let services: Services;
  let env: Env;

  beforeEach(() => {
    stateMock = createMockDurableObjectState();
    env = aFakeEnvWith({});
    services = installFakeServicesWith();

    vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);

    durableObject = new LiveTrackerIndividualDO(stateMock.durableObjectState, env, () => services);
  });

  beforeEach(() => {
    stateMock = createMockDurableObjectState();
    env = aFakeEnvWith({});
    services = installFakeServicesWith();

    vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);

    durableObject = new LiveTrackerIndividualDO(stateMock.durableObjectState, env, () => services);
  });

  const mockStorageGet = (state: LiveTrackerIndividualState | null): void => {
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- Mock must match DurableObjectStorage.get signature
    vi.spyOn(stateMock.mocks.storage, "get").mockImplementation(((keyOrKeys: string | string[]) => {
      if (typeof keyOrKeys === "string") {
        return Promise.resolve(keyOrKeys === "trackerState" ? state : undefined);
      }
      return Promise.resolve(new Map<string, unknown>());
    }) as DurableObjectStorage["get"]);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Multi-platform simultaneous access", () => {
    it("should support Discord and WebSocket targets simultaneously", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({ id: "discord-1" }),
          aFakeWebSocketTargetWith({ id: "websocket-1" }),
          aFakeWebSocketTargetWith({ id: "websocket-2" }),
        ],
      });

      mockStorageGet(state);

      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      const storagePutSpy = vi.spyOn(stateMock.mocks.storage, "put");

      const mockWebSocket1 = createMockWebSocket();
      const mockWebSocket2 = createMockWebSocket();
      const sendSpy1 = vi.spyOn(mockWebSocket1, "send");
      const sendSpy2 = vi.spyOn(mockWebSocket2, "send");

      vi.spyOn(stateMock.durableObjectState, "getWebSockets").mockReturnValue([mockWebSocket1, mockWebSocket2]);
      vi.spyOn(stateMock.durableObjectState, "getTags").mockImplementation((ws: WebSocket) => {
        if (ws === mockWebSocket1) {
          return ["websocket-1"];
        }
        if (ws === mockWebSocket2) {
          return ["websocket-2"];
        }
        return [];
      });

      const newTarget = aFakeDiscordTargetWith({ id: "discord-2" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(200);
      expect(editMessageSpy).toHaveBeenCalled();
      expect(sendSpy1).toHaveBeenCalled();
      expect(sendSpy2).toHaveBeenCalled();
      expect(storagePutSpy).toHaveBeenCalled();
    });

    it("should handle failures in one target without affecting others", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({ id: "discord-1" }),
          aFakeDiscordTargetWith({
            id: "discord-2",
            discord: {
              userId: "user-2",
              guildId: "guild-2",
              channelId: "channel-2",
              messageId: "message-2",
              lastMatchCount: 0,
            },
          }),
        ],
      });

      mockStorageGet(state);

      const editMessageSpy = vi
        .spyOn(services.discordService, "editMessage")
        .mockResolvedValueOnce(apiMessage)
        .mockRejectedValueOnce(new DiscordError(429, { message: "Rate Limited", code: 0 }));

      const newTarget = aFakeDiscordTargetWith({ id: "discord-3" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      expect(editMessageSpy).toHaveBeenCalled();

      const failedTarget = body.state.updateTargets.find((t) => t.id === "discord-2");
      expect(failedTarget?.lastFailureAt).toBeDefined();
      expect(failedTarget?.failureReason).toContain("Rate Limited");
      expect(failedTarget?.markedForRemoval).toBeUndefined();
    });
  });

  describe("Discord permanent error handling", () => {
    it.each([
      { code: 10003, name: "Unknown Channel" },
      { code: 10004, name: "Unknown Guild" },
      { code: 10008, name: "Unknown Message" },
      { code: 10062, name: "Unknown Interaction" },
      { code: 50001, name: "Missing Access" },
    ])("should immediately remove target on $name error (code $code)", async ({ code }) => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "failing-target" })],
      });

      mockStorageGet(state);

      const discordError = new DiscordError(403, { message: "Error", code });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      const newTarget = aFakeDiscordTargetWith({
        id: "new-target",
        discord: { userId: "user-new", guildId: "guild-new", channelId: "channel-new", lastMatchCount: 0 },
      });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets.some((t) => t.id === "failing-target")).toBe(false);
      expect(body.state.updateTargets.some((t) => t.id === "new-target")).toBe(true);
    });

    it("should immediately remove target on 404 HTTP status", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "failing-target" })],
      });

      mockStorageGet(state);

      const discordError = new DiscordError(404, { message: "Not Found", code: 0 });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      const newTarget = aFakeDiscordTargetWith({
        id: "new-target",
        discord: { userId: "user-new", guildId: "guild-new", channelId: "channel-new", lastMatchCount: 0 },
      });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets.some((t) => t.id === "failing-target")).toBe(false);
    });
  });

  describe("Discord transient error handling", () => {
    it("should keep target with 10-minute grace on rate limit error", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "existing-target" })],
      });

      mockStorageGet(state);

      const rateLimitError = new DiscordError(429, { message: "Rate Limited", code: 0 });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(rateLimitError);

      const newTarget = aFakeDiscordTargetWith({ id: "new-target" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      const failingTarget = body.state.updateTargets.find((t) => t.id === "existing-target");
      expect(failingTarget?.markedForRemoval).toBeUndefined();
      expect(failingTarget?.lastFailureAt).toBeDefined();
      expect(body.state.updateTargets).toHaveLength(2);
    });

    it("should remove target after 10 minutes of transient failures", async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
            id: "old-failing-target",
            lastFailureAt: elevenMinutesAgo,
            failureReason: "Rate Limited",
          }),
        ],
      });

      mockStorageGet(state);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const newTarget = aFakeDiscordTargetWith({ id: "new-target" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets.some((t) => t.id === "old-failing-target")).toBe(false);
      expect(body.state.updateTargets.some((t) => t.id === "new-target")).toBe(true);
    });

    it("should keep target with failures less than 10 minutes old", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
            id: "recent-failure",
            lastFailureAt: fiveMinutesAgo,
            failureReason: "Rate Limited",
            discord: {
              userId: "user-123",
              guildId: "guild-456",
              channelId: "channel-789",
              messageId: "existing-message",
              lastMatchCount: 0,
            },
          }),
        ],
      });

      mockStorageGet(state);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const newTarget = aFakeDiscordTargetWith({ id: "new-target" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets).toHaveLength(2);
      const recentFailureTarget = body.state.updateTargets.find((t) => t.id === "recent-failure");
      expect(recentFailureTarget?.lastFailureAt).toBeUndefined();
      expect(recentFailureTarget?.failureReason).toBeUndefined();
    });
  });

  describe("WebSocket error handling", () => {
    it("should immediately remove WebSocket target on send failure", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeWebSocketTargetWith({ id: "failing-websocket" })],
      });

      mockStorageGet(state);

      const mockWebSocket = createMockWebSocket({
        send: vi.fn().mockImplementation(() => {
          throw new Error("Connection closed");
        }),
      });

      vi.spyOn(stateMock.durableObjectState, "getWebSockets").mockReturnValue([mockWebSocket]);
      vi.spyOn(stateMock.durableObjectState, "getTags").mockReturnValue(["failing-websocket"]);

      const newTarget = aFakeDiscordTargetWith({ id: "new-target" });
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets.some((t) => t.id === "failing-websocket")).toBe(false);
      expect(body.state.updateTargets.some((t) => t.id === "new-target")).toBe(true);
    });
  });

  describe("WebSocket lifecycle", () => {
    it.skip("should create WebSocket target on connection", async () => {
      const state = aFakeLiveTrackerIndividualStateWith();
      mockStorageGet(state);

      const request = new Request("https://example.com/websocket", {
        headers: { Upgrade: "websocket" },
      });

      const mockClientWS = createMockWebSocket();
      const mockServerWS = createMockWebSocket();
      const webSocketPairReturn: [WebSocket, WebSocket] = [mockClientWS, mockServerWS];
      const acceptWebSocketSpy = vi.spyOn(stateMock.durableObjectState, "acceptWebSocket");
      // @ts-expect-error - WebSocketPair is not available in Node.js test environment
      global.WebSocketPair = function MockWebSocketPair(this: unknown) {
        return webSocketPairReturn;
      } as never;

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(101);
      const storagePutSpy = vi.spyOn(stateMock.mocks.storage, "put");
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          updateTargets: expect.arrayContaining([expect.objectContaining({ type: "websocket" })]) as UpdateTarget[],
        }),
      );
      expect(acceptWebSocketSpy).toHaveBeenCalledWith(
        mockServerWS,
        expect.arrayContaining([expect.stringMatching(/^websocket-/)]),
      );
    });

    it("should remove WebSocket target on disconnect", async () => {
      const targetId = "websocket-disconnect-test";
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeWebSocketTargetWith({ id: targetId })],
      });

      mockStorageGet(state);

      const storagePutSpy = vi.spyOn(stateMock.mocks.storage, "put");

      const mockWebSocket = createMockWebSocket();
      vi.spyOn(stateMock.durableObjectState, "getTags").mockReturnValue([targetId]);

      await durableObject.webSocketClose(mockWebSocket, 1000, "Normal closure", true);

      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          updateTargets: expect.not.arrayContaining([expect.objectContaining({ id: targetId })]) as UpdateTarget[],
        }),
      );
    });
  });

  describe("New Discord message creation", () => {
    it("should create new message when match count increases", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
            id: "target-1",
            discord: {
              userId: "user-123",
              guildId: "guild-456",
              channelId: "channel-789",
              messageId: "old-message",
              lastMatchCount: 0,
            },
          }),
        ],
        discoveredMatches: {
          "match-1": {
            matchId: "match-1",
            gameTypeAndMap: "Slayer: Recharge",
            gameType: "Slayer",
            gameMap: "Recharge",
            gameMapThumbnailUrl: "data:,",
            duration: "5m",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            playerXuidToGametag: {},
          },
        },
      });

      mockStorageGet(state);

      const newMessage = { ...apiMessage, id: "new-message" };
      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

      const newTarget = aFakeDiscordTargetWith({ id: "target-2" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(createMessageSpy).toHaveBeenCalledWith("channel-789", expect.any(Object));
      expect(deleteMessageSpy).toHaveBeenCalledWith("channel-789", "old-message", expect.any(String));

      const updatedTarget = body.state.updateTargets.find((t) => t.id === "target-1");
      expect(updatedTarget?.discord?.messageId).toBe("new-message");
      expect(updatedTarget?.discord?.lastMatchCount).toBe(1);
    });

    it("should edit existing message when match count unchanged", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
            id: "target-1",
            discord: {
              userId: "user-123",
              guildId: "guild-456",
              channelId: "channel-789",
              messageId: "existing-message",
              lastMatchCount: 1,
            },
          }),
        ],
        discoveredMatches: {
          "match-1": {
            matchId: "match-1",
            gameTypeAndMap: "Slayer: Recharge",
            gameType: "Slayer",
            gameMap: "Recharge",
            gameMapThumbnailUrl: "data:,",
            duration: "5m",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            playerXuidToGametag: {},
          },
        },
      });

      mockStorageGet(state);

      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      const createMessageSpy = vi.spyOn(services.discordService, "createMessage");

      const newTarget = aFakeWebSocketTargetWith({ id: "websocket-target" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(200);

      expect(editMessageSpy).toHaveBeenCalledWith("channel-789", "existing-message", expect.any(Object));
      expect(createMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("Target cleanup", () => {
    it("should filter out marked targets after broadcast", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({ id: "target-1" }),
          aFakeDiscordTargetWith({ id: "target-2", markedForRemoval: true }),
          aFakeDiscordTargetWith({ id: "target-3" }),
        ],
      });

      mockStorageGet(state);
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const newTarget = aFakeDiscordTargetWith({ id: "target-4" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.state.updateTargets.some((t) => t.id === "target-2")).toBe(false);
      expect(body.state.updateTargets.some((t) => t.id === "target-1")).toBe(true);
      expect(body.state.updateTargets.some((t) => t.id === "target-3")).toBe(true);
      expect(body.state.updateTargets.some((t) => t.id === "target-4")).toBe(true);
    });

    it("should log when targets are cleaned up", async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({ id: "target-1" }),
          aFakeDiscordTargetWith({ id: "target-2", lastFailureAt: elevenMinutesAgo }),
        ],
      });

      mockStorageGet(state);
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const logSpy = vi.spyOn(services.logService, "info");

      const newTarget = aFakeDiscordTargetWith({ id: "target-3" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(200);

      expect(logSpy).toHaveBeenCalledWith("Cleaned up stale targets", expect.any(Map));

      const logCall = logSpy.mock.calls.find((call) => call[0] === "Cleaned up stale targets");
      const logData = logCall?.[1] as Map<string, string> | undefined;
      expect(logData?.get("removedCount")).toBe("1");
    });
  });

  describe("Subscribe API", () => {
    it("should add a new target to the tracker", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "existing-target" })],
      });

      mockStorageGet(state);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const newTarget = aFakeDiscordTargetWith({ id: "new-discord-target" });

      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      const body = await response.json<LiveTrackerIndividualSubscribeSuccessResponse>();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.targetId).toBe("new-discord-target");

      expect(state.updateTargets).toHaveLength(2);
      expect(state.updateTargets.map((t) => t.id)).toContain("existing-target");
      expect(state.updateTargets.map((t) => t.id)).toContain("new-discord-target");
    });

    it("should reject duplicate target IDs", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "existing-target" })],
      });

      mockStorageGet(state);

      const duplicateTarget = aFakeDiscordTargetWith({ id: "existing-target" });

      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: duplicateTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      const body = await response.json<LiveTrackerIndividualSubscribeFailureResponse>();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Target ID already exists");
      expect(state.updateTargets).toHaveLength(1);
    });

    it("should reject invalid target data", async () => {
      const state = aFakeLiveTrackerIndividualStateWith();
      mockStorageGet(state);

      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: { invalid: "data" } }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeFailureResponse>();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid target data");
    });

    it("should return 404 when tracker not found", async () => {
      mockStorageGet(null);

      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: aFakeWebSocketTargetWith() }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualSubscribeFailureResponse>();

      expect(response.status).toBe(404);

      expect(body.success).toBe(false);
    });
  });

  describe("Unsubscribe API", () => {
    it("should remove a target from the tracker", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "target-1" }), aFakeDiscordTargetWith({ id: "target-2" })],
      });

      mockStorageGet(state);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const request = new Request("https://example.com/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ targetId: "target-1" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualUnsubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.success).toBe(true);

      expect(body.targetId).toBe("target-1");

      expect(state.updateTargets).toHaveLength(1);
      expect(state.updateTargets[0]?.id).toBe("target-2");
    });

    it("should stop tracker when last target is removed", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "last-target" })],
      });

      mockStorageGet(state);

      const request = new Request("https://example.com/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ targetId: "last-target" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualUnsubscribeSuccessResponse>();

      expect(response.status).toBe(200);

      expect(body.success).toBe(true);

      expect(state.updateTargets).toHaveLength(0);

      expect(body.state.status).toBe("stopped");
    });

    it("should return 404 when target not found", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "existing-target" })],
      });

      mockStorageGet(state);

      const request = new Request("https://example.com/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ targetId: "nonexistent-target" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualUnsubscribeFailureResponse>();

      expect(response.status).toBe(404);

      expect(body.success).toBe(false);

      expect(body.error).toBe("Target not found");
    });

    it("should return 400 when targetId is missing", async () => {
      const state = aFakeLiveTrackerIndividualStateWith();
      mockStorageGet(state);

      const request = new Request("https://example.com/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ targetId: "" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);
      const body = await response.json<LiveTrackerIndividualUnsubscribeFailureResponse>();

      expect(response.status).toBe(400);

      expect(body.success).toBe(false);
    });
  });

  describe("Get Targets API", () => {
    it("should return list of all active targets", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "discord-1" }), aFakeWebSocketTargetWith({ id: "websocket-1" })],
      });

      mockStorageGet(state);

      const response = await durableObject.fetch(new Request("https://example.com/targets", { method: "GET" }));
      const body = await response.json<LiveTrackerIndividualTargetsResponse>();

      expect(response.status).toBe(200);

      expect(body.success).toBe(true);

      expect(body.targets).toHaveLength(2);
    });

    it("should return empty array when no targets exist", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [],
      });

      mockStorageGet(state);

      const response = await durableObject.fetch(new Request("https://example.com/targets", { method: "GET" }));
      const body = await response.json<LiveTrackerIndividualTargetsResponse>();

      expect(response.status).toBe(200);

      expect(body.success).toBe(true);

      expect(body.targets).toHaveLength(0);
    });

    it("should return 404 when tracker not found", async () => {
      mockStorageGet(null);

      const request = new Request("https://example.com/targets", {
        method: "GET",
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(404);
    });
  });
});
