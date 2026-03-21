import type { MockInstance } from "vitest";
import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import { LiveTrackerIndividualDO } from "../live-tracker-individual-do.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { Services } from "../../../services/install.mjs";
import { DiscordError } from "../../../services/discord/discord-error.mjs";
import { apiMessage, guild } from "../../../services/discord/fakes/data.mjs";
import { aFakeDurableObjectId } from "../../fakes/live-tracker-do.fake.mjs";
import { getMatchStats } from "../../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
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
  LiveTrackerIndividualWebStartSuccessResponse,
  LiveTrackerIndividualWebStartFailureResponse,
  LiveTrackerIndividualStatusResponse,
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
    it("supports Discord and WebSocket targets simultaneously", async () => {
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

    it("handles failures in one target without affecting others", async () => {
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

    it("immediately removes target on 404 HTTP status", async () => {
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
    it("keeps target with 10-minute grace on rate limit error", async () => {
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

    it("removes target after 10 minutes of transient failures", async () => {
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

    it("keeps target with failures less than 10 minutes old", async () => {
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
    it("immediately removes WebSocket target on send failure", async () => {
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
    // TODO: WebSocketPair is a Cloudflare Workers runtime API not available in Node.js test environment.
    // Consider integration tests using miniflare or wrangler test environment for WebSocket functionality.
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

    it("removes WebSocket target on disconnect", async () => {
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
    it("creates new message when match count increases", async () => {
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

    it("edits existing message when match count unchanged", async () => {
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
    it("filters out marked targets after broadcast", async () => {
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

    it("logs when targets are cleaned up", async () => {
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
    it("adds a new target to the tracker", async () => {
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

    it("rejects duplicate target IDs", async () => {
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

    it("rejects invalid target data", async () => {
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

    it("returns 404 when tracker not found", async () => {
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
    it("removes a target from the tracker", async () => {
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

    it("stops tracker when last target is removed", async () => {
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

    it("returns 404 when target not found", async () => {
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

    it("returns 400 when targetId is missing", async () => {
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
    it("returns list of all active targets", async () => {
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

    it("returns empty array when no targets exist", async () => {
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

    it("returns 404 when tracker not found", async () => {
      mockStorageGet(null);

      const request = new Request("https://example.com/targets", {
        method: "GET",
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(404);
    });
  });

  describe("Web Start API", () => {
    it("initializes tracker with no targets and return websocket URL", async () => {
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([]);
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          selectedMatchIds: ["match1", "match2"],
          groupings: [["match1", "match2"]],
          searchStartTime: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(200);
      const body = await response.json<LiveTrackerIndividualWebStartSuccessResponse>();
      expect(body.success).toBe(true);
      expect(body.websocketUrl).toBe("/ws/tracker/individual/TestPlayer");
      expect(body.gamertag).toBe("TestPlayer");

      // Verify storage was called to persist state
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Testing storage mock
      expect(stateMock.mocks.storage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          gamertag: "TestPlayer",
          xuid: "xuid(1234567890)",
          updateTargets: [],
          status: "active",
        }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method -- Testing storage mock
      expect(stateMock.mocks.storage.setAlarm).toHaveBeenCalled();
    });

    it("fetches and merge selected matches", async () => {
      const getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([]);
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          selectedMatchIds: ["match1", "match2"],
          groupings: [],
          searchStartTime: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });

      await durableObject.fetch(request);

      expect(getMatchDetailsSpy).toHaveBeenCalledWith(["match1", "match2"]);
    });

    it("applies user-provided groupings", async () => {
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([]);
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          selectedMatchIds: ["match1", "match2", "match3"],
          groupings: [["match1", "match2"], ["match3"]],
          searchStartTime: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(200);
    });

    it("handles empty selected matches (start from now)", async () => {
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([]);
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          selectedMatchIds: [],
          groupings: [],
          searchStartTime: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(200);
      const body = await response.json<LiveTrackerIndividualWebStartSuccessResponse>();
      expect(body.success).toBe(true);
    });

    it("returns error when halo service fails", async () => {
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });
      vi.spyOn(services.haloService, "getMatchDetails").mockRejectedValue(new Error("API failure"));

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          selectedMatchIds: ["match1"],
          groupings: [],
          searchStartTime: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObject.fetch(request);

      expect(response.status).toBe(500);
      const body = await response.json<LiveTrackerIndividualWebStartFailureResponse>();
      expect(body.success).toBe(false);
      expect(body.error).toContain("API failure");
    });
  });

  describe("LiveTrackerIndividualDO - Series Integration", () => {
    let durableObjectForSeries: LiveTrackerIndividualDO;
    let stateMockForSeries: ReturnType<typeof createMockDurableObjectState>;
    let servicesForSeries: Services;
    let envForSeries: Env;

    beforeEach(() => {
      stateMockForSeries = createMockDurableObjectState();
      envForSeries = aFakeEnvWith({});
      servicesForSeries = installFakeServicesWith();
      durableObjectForSeries = new LiveTrackerIndividualDO(
        stateMockForSeries.durableObjectState,
        envForSeries,
        () => servicesForSeries,
      );
    });

    const mockStorageGetForSeries = (state: LiveTrackerIndividualState | null): void => {
      vi.spyOn(stateMockForSeries.mocks.storage, "get").mockImplementation((async (keyOrKeys: string | string[]) => {
        if (typeof keyOrKeys === "string") {
          return Promise.resolve(keyOrKeys === "trackerState" ? state : undefined);
        }
        return Promise.resolve(new Map<string, unknown>());
      }) as DurableObjectStorage["get"]);
    };

    describe("series data fetching", () => {
      // TODO: These tests require mocking the full refresh cycle and NeatQueue DO HTTP client.
      // The refresh logic calls fetchSeriesDataFromNeatQueueDO() which makes HTTP requests to NeatQueue DO.
      // Implement these tests once proper NeatQueue DO stub factory is available.
      it.skip("preserves existing series data through refresh cycles", async () => {
        vi.spyOn(servicesForSeries.haloService, "getRecentMatchHistory").mockResolvedValue([]);

        const existingSeriesData = {
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            { name: "Team Alpha", playerIds: ["xuid1", "xuid2"] },
            { name: "Team Beta", playerIds: ["xuid3", "xuid4"] },
          ],
          seriesScore: "Team Alpha 2 - 1 Team Beta",
          matchIds: ["match1", "match2", "match3"],
          discoveredMatches: new Map(),
          playersAssociationData: {},
          substitutions: [],
          startTime: new Date().toISOString(),
          lastUpdateTime: new Date().toISOString(),
        };

        const state = aFakeLiveTrackerIndividualStateWith({
          seriesData: existingSeriesData,
          seriesLink: {
            seriesId: { guildId: "guild-123", queueNumber: 5 },
            linkedAt: new Date().toISOString(),
            lastFetchedAt: new Date().toISOString(),
          },
          matchGroupings: {
            match1: {
              groupId: "group1",
              matchIds: ["match1"],
              participants: ["xuid1", "xuid2"],
              seriesId: { guildId: "guild-123", queueNumber: 5 },
            },
          },
        });

        mockStorageGet(state);
        const putSpy = vi.spyOn(stateMockForSeries.mocks.storage, "put").mockResolvedValue();

        const request = new Request("https://example.com/refresh", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        });

        await durableObjectForSeries.fetch(request);

        expect(putSpy).toHaveBeenCalled();

        const putCalls = vi.mocked(putSpy).mock.calls;
        const stateArg = putCalls[0]?.[1];
        const savedState = stateArg as LiveTrackerIndividualState;

        expect(savedState.seriesData).toBeDefined();
        expect(savedState.seriesData?.seriesId.queueNumber).toBe(5);
        expect(savedState.seriesData?.teams).toHaveLength(2);
        expect(savedState.seriesLink).toBeDefined();
      });

      it.skip("persists series data even after series completes", async () => {
        const mockNeatQueueStub = {
          fetch: vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                success: false,
                error: "Series not found",
              }),
            ),
          ),
        };

        const mockGetStub = vi.fn().mockReturnValue(mockNeatQueueStub);
        env.LIVE_TRACKER_DO.get = mockGetStub;

        vi.spyOn(servicesForSeries.haloService, "getRecentMatchHistory").mockResolvedValue([]);

        const existingSeriesData = {
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            { name: "Team Alpha", playerIds: ["xuid1", "xuid2"] },
            { name: "Team Beta", playerIds: ["xuid3", "xuid4"] },
          ],
          seriesScore: "Team Alpha 3 - 2 Team Beta",
          matchIds: ["match1", "match2", "match3", "match4", "match5"],
          discoveredMatches: new Map(),
          playersAssociationData: {},
          substitutions: [],
          startTime: new Date().toISOString(),
          lastUpdateTime: new Date().toISOString(),
        };

        const state = aFakeLiveTrackerIndividualStateWith({
          seriesData: existingSeriesData,
          seriesLink: {
            seriesId: { guildId: "guild-123", queueNumber: 5 },
            linkedAt: new Date().toISOString(),
            lastFetchedAt: new Date().toISOString(),
          },
          matchGroupings: {
            match1: {
              groupId: "group1",
              matchIds: ["match1"],
              participants: ["xuid1", "xuid2"],
              seriesId: { guildId: "guild-123", queueNumber: 5 },
            },
          },
        });

        mockStorageGet(state);
        const putSpy = vi.spyOn(stateMockForSeries.mocks.storage, "put").mockResolvedValue();

        const request = new Request("https://example.com/refresh", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        });

        await durableObjectForSeries.fetch(request);

        const putCalls = vi.mocked(putSpy).mock.calls;
        const stateArg = putCalls[0]?.[1];
        const savedState = stateArg as LiveTrackerIndividualState;

        expect(savedState.seriesData).toBeDefined();
        expect(savedState.seriesData?.matchIds).toHaveLength(5);
        expect(savedState.seriesData?.seriesScore).toBe("Team Alpha 3 - 2 Team Beta");
      });

      it.skip("operates normally when no series is detected", async () => {
        vi.spyOn(servicesForSeries.haloService, "getRecentMatchHistory").mockResolvedValue([]);

        const state = aFakeLiveTrackerIndividualStateWith({
          matchGroupings: {},
        });

        mockStorageGet(state);
        const putSpy = vi.spyOn(stateMockForSeries.mocks.storage, "put").mockResolvedValue();

        const request = new Request("https://example.com/refresh", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        });

        const response = await durableObjectForSeries.fetch(request);

        expect(response.status).toBe(200);

        const putCalls = vi.mocked(putSpy).mock.calls;
        const stateArg = putCalls[0]?.[1];
        const savedState = stateArg as LiveTrackerIndividualState;

        expect(savedState.seriesData).toBeUndefined();
        expect(savedState.seriesLink).toBeUndefined();
      });
    });

    describe("state conversion with series data", () => {
      it("includes series data in state response", async () => {
        const seriesData = {
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            { name: "Team Alpha", playerIds: ["xuid1", "xuid2"] },
            { name: "Team Beta", playerIds: ["xuid3", "xuid4"] },
          ],
          seriesScore: "Team Alpha 2 - 1 Team Beta",
          matchIds: ["match1", "match2", "match3"],
          discoveredMatches: new Map(),
          playersAssociationData: {},
          substitutions: [],
          startTime: new Date().toISOString(),
          lastUpdateTime: new Date().toISOString(),
        };

        const state = aFakeLiveTrackerIndividualStateWith({
          seriesData,
          seriesLink: {
            seriesId: { guildId: "guild-123", queueNumber: 5 },
            linkedAt: new Date().toISOString(),
            lastFetchedAt: new Date().toISOString(),
          },
        });

        mockStorageGetForSeries(state);

        const request = new Request("https://example.com/status", {
          method: "GET",
        });

        const response = await durableObjectForSeries.fetch(request);
        const body = await response.json<LiveTrackerIndividualStatusResponse>();

        expect(body.state).toBeDefined();
        expect(body.state.seriesLink).toBeDefined();
        expect(body.state.seriesLink?.seriesId.queueNumber).toBe(5);
        expect(body.state.seriesData).toBeDefined();
        expect(body.state.seriesData?.teams).toHaveLength(2);
      });

      it("excludes series data when not present", async () => {
        const state = aFakeLiveTrackerIndividualStateWith();
        delete state.seriesData;
        delete state.seriesLink;

        mockStorageGetForSeries(state);

        const request = new Request("https://example.com/status", {
          method: "GET",
        });

        const response = await durableObjectForSeries.fetch(request);
        const body = await response.json<LiveTrackerIndividualStatusResponse>();

        expect(body.state.seriesData).toBeUndefined();
        expect(body.state.seriesLink).toBeUndefined();
      });
    });

    describe("websocket broadcasts with series data", () => {
      it("includes series link in broadcast payloads when present", async () => {
        const seriesData = {
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            { name: "Team Alpha", playerIds: ["xuid1", "xuid2"] },
            { name: "Team Beta", playerIds: ["xuid3", "xuid4"] },
          ],
          seriesScore: "Team Alpha 2 - 1 Team Beta",
          matchIds: ["match1", "match2", "match3"],
          discoveredMatches: new Map(),
          playersAssociationData: {},
          substitutions: [],
          startTime: new Date().toISOString(),
          lastUpdateTime: new Date().toISOString(),
        };

        const state = aFakeLiveTrackerIndividualStateWith({
          seriesData,
          seriesLink: {
            seriesId: { guildId: "guild-123", queueNumber: 5 },
            linkedAt: new Date().toISOString(),
            lastFetchedAt: new Date().toISOString(),
          },
        });

        mockStorageGetForSeries(state);

        const request = new Request("https://example.com/status", {
          method: "GET",
        });

        const response = await durableObjectForSeries.fetch(request);
        const body = await response.json<LiveTrackerIndividualStatusResponse>();

        expect(body.state.seriesLink).toBeDefined();
        expect(body.state.seriesLink?.seriesId.queueNumber).toBe(5);
      });
    });
  });

  describe("KV Storage Integration", () => {
    let durableObjectForKV: LiveTrackerIndividualDO;
    let stateMockForKV: ReturnType<typeof createMockDurableObjectState>;
    let servicesForKV: Services;
    let envForKV: Env;

    beforeEach(() => {
      stateMockForKV = createMockDurableObjectState();
      envForKV = aFakeEnvWith({});
      servicesForKV = installFakeServicesWith();

      vi.spyOn(servicesForKV.discordService, "getGuild").mockResolvedValue(guild);

      durableObjectForKV = new LiveTrackerIndividualDO(
        stateMockForKV.durableObjectState,
        envForKV,
        () => servicesForKV,
      );
    });

    const mockStorageGetForKV = (state: LiveTrackerIndividualState | null): void => {
      vi.spyOn(stateMockForKV.mocks.storage, "get").mockImplementation((async (keyOrKeys: string | string[]) => {
        if (typeof keyOrKeys === "string") {
          return Promise.resolve(state);
        }
        return Promise.resolve(new Map<string, unknown>());
      }) as DurableObjectStorage["get"]);
    };

    it("saves newly discovered matches to KV storage", async () => {
      mockStorageGetForKV(null);

      const mockMatch = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      vi.spyOn(servicesForKV.haloService, "getMatchDetails").mockResolvedValue([mockMatch]);
      vi.spyOn(servicesForKV.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(servicesForKV.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer: Aquarius");
      vi.spyOn(servicesForKV.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
      vi.spyOn(servicesForKV.haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
      vi.spyOn(servicesForKV.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(servicesForKV.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
      vi.spyOn(envForKV.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const kvPutSpy = vi.spyOn(envForKV.APP_DATA, "put");

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          searchStartTime: new Date().toISOString(),
          selectedMatchIds: ["9535b946-f30c-4a43-b852-000000slayer"],
          groupings: [],
        }),
        headers: { "Content-Type": "application/json" },
      });

      await durableObjectForKV.fetch(request);

      expect(kvPutSpy).toHaveBeenCalledWith(
        "live-tracker-match:9535b946-f30c-4a43-b852-000000slayer",
        expect.any(String),
        { expirationTtl: 86400 },
      );

      const firstCallData = kvPutSpy.mock.calls[0]?.[1];
      if (typeof firstCallData === "string") {
        const parsedMatch = JSON.parse(firstCallData) as typeof mockMatch;
        expect(parsedMatch).toHaveProperty("MatchId");
        expect(parsedMatch.MatchId).toBe("9535b946-f30c-4a43-b852-000000slayer");
      }
    });

    it("stores match IDs in state instead of full match data", async () => {
      mockStorageGetForKV(null);

      const mockMatch = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      vi.spyOn(servicesForKV.haloService, "getMatchDetails").mockResolvedValue([mockMatch]);
      vi.spyOn(servicesForKV.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(servicesForKV.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer: Aquarius");
      vi.spyOn(servicesForKV.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
      vi.spyOn(servicesForKV.haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
      vi.spyOn(servicesForKV.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(servicesForKV.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
      vi.spyOn(envForKV.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });

      const storagePutSpy = vi.spyOn(stateMockForKV.mocks.storage, "put");

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          searchStartTime: new Date().toISOString(),
          selectedMatchIds: ["9535b946-f30c-4a43-b852-000000slayer"],
          groupings: [],
        }),
        headers: { "Content-Type": "application/json" },
      });

      await durableObjectForKV.fetch(request);

      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          matchIds: expect.arrayContaining(["9535b946-f30c-4a43-b852-000000slayer"]) as string[],
        }),
      );
    });

    it("loads matches from KV when broadcasting to targets", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeWebSocketTargetWith({ id: "ws-target" })],
        matchIds: ["9535b946-f30c-4a43-b852-000000slayer"],
        discoveredMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": {
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
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

      mockStorageGetForKV(state);

      const mockMatch = getMatchStats("9535b946-f30c-4a43-b852-000000slayer");
      if (!mockMatch) {
        throw new Error("Test setup error: match not found");
      }

      // Mock getWebSockets and getTags for WebSocket target
      const mockWebSocket = createMockWebSocket();
      vi.spyOn(stateMockForKV.durableObjectState, "getWebSockets").mockReturnValue([mockWebSocket]);
      vi.spyOn(stateMockForKV.durableObjectState, "getTags").mockReturnValue(["ws-target"]);

      // KV.get returns parsed object, not JSON string
      const kvGetSpy: MockInstance = vi.spyOn(envForKV.APP_DATA, "get");
      kvGetSpy.mockResolvedValue(mockMatch);

      const newTarget = aFakeWebSocketTargetWith({ id: "ws-target-2" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      await durableObjectForKV.fetch(request);

      expect(kvGetSpy).toHaveBeenCalledWith("live-tracker-match:9535b946-f30c-4a43-b852-000000slayer", "json");
    });

    it("handles missing matches in KV gracefully during broadcast", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith({ id: "target-1" })],
        matchIds: ["expired-match"],
        discoveredMatches: {
          "expired-match": {
            matchId: "expired-match",
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

      mockStorageGetForKV(state);

      const kvGetSpy: MockInstance = vi.spyOn(envForKV.APP_DATA, "get");
      kvGetSpy.mockResolvedValue(null);
      vi.spyOn(servicesForKV.discordService, "editMessage").mockResolvedValue(apiMessage);

      const newTarget = aFakeWebSocketTargetWith({ id: "ws-target" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await durableObjectForKV.fetch(request);

      expect(response.status).toBe(200);
    });

    it("loads matches from KV for series score calculations", async () => {
      const mockMatch1 = getMatchStats("9535b946-f30c-4a43-b852-000000slayer");
      const mockMatch2 = getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf");
      if (!mockMatch1 || !mockMatch2) {
        throw new Error("Test setup error: matches not found");
      }

      const state = aFakeLiveTrackerIndividualStateWith({
        matchIds: ["9535b946-f30c-4a43-b852-000000slayer", "d81554d7-ddfe-44da-a6cb-000000000ctf"],
        discoveredMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": {
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
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
          "d81554d7-ddfe-44da-a6cb-000000000ctf": {
            matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
            gameTypeAndMap: "CTF: Behemoth",
            gameType: "CTF",
            gameMap: "Behemoth",
            gameMapThumbnailUrl: "data:,",
            duration: "7m",
            gameScore: "3:2",
            gameSubScore: null,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            playerXuidToGametag: {},
          },
        },
        updateTargets: [aFakeWebSocketTargetWith({ id: "ws-target" })],
      });

      mockStorageGetForKV(state);

      // Mock getWebSockets and getTags for WebSocket target
      const mockWebSocket = createMockWebSocket();
      vi.spyOn(stateMockForKV.durableObjectState, "getWebSockets").mockReturnValue([mockWebSocket]);
      vi.spyOn(stateMockForKV.durableObjectState, "getTags").mockReturnValue(["ws-target"]);

      // KV.get returns parsed objects, not JSON strings
      const kvGetSpy: MockInstance = vi.spyOn(envForKV.APP_DATA, "get");
      kvGetSpy.mockImplementation(async (key) => {
        if (key === "live-tracker-match:9535b946-f30c-4a43-b852-000000slayer") {
          return Promise.resolve(mockMatch1);
        }
        if (key === "live-tracker-match:d81554d7-ddfe-44da-a6cb-000000000ctf") {
          return Promise.resolve(mockMatch2);
        }
        return Promise.resolve(null);
      });

      const newTarget = aFakeWebSocketTargetWith({ id: "ws-target-2" });
      const request = new Request("https://example.com/subscribe", {
        method: "POST",
        body: JSON.stringify({ target: newTarget }),
        headers: { "Content-Type": "application/json" },
      });

      await durableObjectForKV.fetch(request);

      // Verify both matches were loaded from KV for broadcast payload
      expect(kvGetSpy).toHaveBeenCalledWith("live-tracker-match:9535b946-f30c-4a43-b852-000000slayer", "json");
      expect(kvGetSpy).toHaveBeenCalledWith("live-tracker-match:d81554d7-ddfe-44da-a6cb-000000000ctf", "json");
    });

    it("continues operation when KV put fails", async () => {
      mockStorageGetForKV(null);

      const mockMatch = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      vi.spyOn(servicesForKV.haloService, "getMatchDetails").mockResolvedValue([mockMatch]);
      vi.spyOn(servicesForKV.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(servicesForKV.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer: Aquarius");
      vi.spyOn(servicesForKV.haloService, "getMapThumbnailUrl").mockResolvedValue("data:,");
      vi.spyOn(servicesForKV.haloService, "getPlayerXuidsToGametags").mockResolvedValue(new Map());
      vi.spyOn(servicesForKV.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(servicesForKV.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
      vi.spyOn(envForKV.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });
      const kvPutSpy = vi.spyOn(envForKV.APP_DATA, "put").mockRejectedValue(new Error("KV storage error"));

      const request = new Request("https://example.com/web-start", {
        method: "POST",
        body: JSON.stringify({
          xuid: "xuid(1234567890)",
          gamertag: "TestPlayer",
          searchStartTime: new Date().toISOString(),
          selectedMatchIds: ["9535b946-f30c-4a43-b852-000000slayer"],
          groupings: [],
        }),
        headers: { "Content-Type": "application/json" },
      });

      // handleWebStart catches errors and returns 500 failure response
      const response = await durableObjectForKV.fetch(request);

      expect(kvPutSpy).toHaveBeenCalled();
      expect(response.status).toBe(500);
      const body = await response.json<LiveTrackerIndividualWebStartFailureResponse>();
      expect(body.success).toBe(false);
    });
  });
});
