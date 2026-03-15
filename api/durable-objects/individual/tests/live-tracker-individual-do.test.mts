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
import type { LiveTrackerIndividualState } from "../types.mjs";

// Helper to create mock WebSocket
// Note: Type assertion needed to create partial mock of complex WebSocket interface
const createMockWebSocket = (overrides: Partial<WebSocket> = {}): WebSocket => {
  return {
    send: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } satisfies Partial<WebSocket> as WebSocket;
};

// Create a mock SQL storage that satisfies the interface
// Note: Type assertion needed for SqlStorage which has complex method signatures
const createMockSqlStorage = (): SqlStorage => {
  return {
    exec: vi.fn(),
    databaseSize: 0,
    Cursor: vi.fn() as never,
    Statement: vi.fn() as never,
  } as SqlStorage;
};

// Helper to create mock Durable Object state
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
    // Note: Type assertion needed for KV storage - tests don't use KV methods
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

    // Mock getGuild (called by stateToContractData)
    vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);

    durableObject = new LiveTrackerIndividualDO(stateMock.durableObjectState, env, () => services);
  });

  // Helper to mock storage.get for tracker state
  beforeEach(() => {
    stateMock = createMockDurableObjectState();
    env = aFakeEnvWith({});
    services = installFakeServicesWith();

    // Mock getGuild (called by stateToContractData)
    vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);

    durableObject = new LiveTrackerIndividualDO(stateMock.durableObjectState, env, () => services);
  });

  // Helper to mock storage.get for tracker state
  // Note: Type assertion needed because mockImplementation can't satisfy both overload signatures
  // of DurableObjectStorage.get (single key vs array of keys) at compile time
  const mockStorageGet = (state: LiveTrackerIndividualState | null): void => {
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- Mock must match DurableObjectStorage.get signature
    vi.spyOn(stateMock.mocks.storage, "get").mockImplementation(((keyOrKeys: string | string[]) => {
      if (typeof keyOrKeys === "string") {
        return Promise.resolve(keyOrKeys === "trackerState" ? state : undefined);
      }
      // Array case - return empty Map
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

      // Mock Discord service
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      // Mock WebSocket broadcast
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

      // Trigger broadcast via setState
      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Verify Discord message was updated
      expect(editMessageSpy).toHaveBeenCalledWith(
        "channel-789",
        "message-001",
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect matcher returns any
          embeds: expect.arrayContaining([]),
        }),
      );

      // Verify both WebSockets received broadcast
      expect(sendSpy1).toHaveBeenCalled();
      expect(sendSpy2).toHaveBeenCalled();
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

      // First Discord succeeds, second fails with transient error
      const editMessageSpy = vi
        .spyOn(services.discordService, "editMessage")
        .mockResolvedValueOnce(apiMessage)
        .mockRejectedValueOnce(new DiscordError(429, { message: "Rate Limited", code: 0 }));

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Both targets should be attempted
      expect(editMessageSpy).toHaveBeenCalledTimes(2);

      // Second target should have failure tracking
      const [, failedTarget] = state.updateTargets;
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
        updateTargets: [aFakeDiscordTargetWith()],
      });

      mockStorageGet(state);

      const discordError = new DiscordError(403, { message: "Error", code });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      const [target] = state.updateTargets; // Capture before filtering
      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Target should be marked for removal
      expect(target?.markedForRemoval).toBe(true);
      expect(state.updateTargets).toHaveLength(0); // Filtered out after broadcast
    });

    it("should immediately remove target on 404 HTTP status", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith()],
      });

      mockStorageGet(state);

      const discordError = new DiscordError(404, { message: "Not Found", code: 0 });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Target should be removed
      expect(state.updateTargets).toHaveLength(0);
    });
  });

  describe("Discord transient error handling", () => {
    it("should keep target with 10-minute grace on rate limit error", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeDiscordTargetWith()],
      });

      mockStorageGet(state);

      const rateLimitError = new DiscordError(429, { message: "Rate Limited", code: 0 });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(rateLimitError);

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Target should NOT be marked for removal
      expect(state.updateTargets[0]?.markedForRemoval).toBeUndefined();
      expect(state.updateTargets[0]?.lastFailureAt).toBeDefined();
      expect(state.updateTargets).toHaveLength(1);
    });

    it("should remove target after 10 minutes of transient failures", async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
            lastFailureAt: elevenMinutesAgo,
            failureReason: "Rate Limited",
          }),
        ],
      });

      mockStorageGet(state);

      // Mock successful update (won't be called due to cleanup)
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Target should be cleaned up
      expect(state.updateTargets).toHaveLength(0);
    });

    it("should keep target with failures less than 10 minutes old", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
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

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Target should be kept (failure cleared on success)
      expect(state.updateTargets).toHaveLength(1);
      expect(state.updateTargets[0]?.lastFailureAt).toBeUndefined();
      expect(state.updateTargets[0]?.failureReason).toBeUndefined();
    });
  });

  describe("WebSocket error handling", () => {
    it("should immediately remove WebSocket target on send failure", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [aFakeWebSocketTargetWith()],
      });

      mockStorageGet(state);

      const mockWebSocket = createMockWebSocket({
        send: vi.fn().mockImplementation(() => {
          throw new Error("Connection closed");
        }),
      });

      vi.spyOn(stateMock.durableObjectState, "getWebSockets").mockReturnValue([mockWebSocket]);
      vi.spyOn(stateMock.durableObjectState, "getTags").mockReturnValue(["websocket-test-id"]);

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // WebSocket target should be removed immediately
      expect(state.updateTargets).toHaveLength(0);
    });
  });

  describe("WebSocket lifecycle", () => {
    it.skip("should create WebSocket target on connection", async () => {
      // Skip: Node.js Response doesn't support WebSocket upgrade (status 101)
      // This is Cloudflare Workers-specific behavior that can't be tested in vitest
      const state = aFakeLiveTrackerIndividualStateWith();
      mockStorageGet(state);

      const request = new Request("https://example.com/websocket", {
        headers: { Upgrade: "websocket" },
      });

      // Mock WebSocketPair
      const mockClientWS = createMockWebSocket();
      const mockServerWS = createMockWebSocket();
      const webSocketPairReturn: [WebSocket, WebSocket] = [mockClientWS, mockServerWS];
      const acceptWebSocketSpy = vi.spyOn(stateMock.durableObjectState, "acceptWebSocket");
      // @ts-expect-error - WebSocketPair is not available in Node.js test environment
      global.WebSocketPair = function MockWebSocketPair(this: unknown) {
        return webSocketPairReturn;
      } as never;

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      const response = await durableObject["handleWebSocket"](request);

      expect(response.status).toBe(101);
      expect(state.updateTargets).toHaveLength(1);
      expect(state.updateTargets[0]?.type).toBe("websocket");
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

      const mockWebSocket = createMockWebSocket();
      vi.spyOn(stateMock.durableObjectState, "getTags").mockReturnValue([targetId]);

      await durableObject.webSocketClose(mockWebSocket, 1000, "Normal closure", true);

      // Target should be removed
      expect(state.updateTargets).toHaveLength(0);
    });
  });

  describe("New Discord message creation", () => {
    it("should create new message when match count increases", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
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

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Should create new message
      expect(createMessageSpy).toHaveBeenCalledWith("channel-789", expect.any(Object));

      // Should delete old message
      expect(deleteMessageSpy).toHaveBeenCalledWith("channel-789", "old-message", expect.any(String));

      // Should update target with new message ID and match count
      const [updatedTarget] = state.updateTargets;
      expect(updatedTarget?.discord?.messageId).toBe("new-message");
      expect(updatedTarget?.discord?.lastMatchCount).toBe(1);
    });

    it("should edit existing message when match count unchanged", async () => {
      const state = aFakeLiveTrackerIndividualStateWith({
        updateTargets: [
          aFakeDiscordTargetWith({
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

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Should edit existing message
      expect(editMessageSpy).toHaveBeenCalledWith("channel-789", "existing-message", expect.any(Object));

      // Should NOT create new message
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

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // target-2 should be removed
      expect(state.updateTargets).toHaveLength(2);
      expect(state.updateTargets.map((t) => t.id)).not.toContain("target-2");
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

      // eslint-disable-next-line @typescript-eslint/dot-notation -- Accessing private method
      await durableObject["setState"](state);

      // Should log cleanup
      expect(logSpy).toHaveBeenCalledWith("Cleaned up stale targets", expect.any(Map));

      // Should show removed count
      const logCall = logSpy.mock.calls.find((call) => call[0] === "Cleaned up stale targets");
      const logData = logCall?.[1] as Map<string, string> | undefined;
      expect(logData?.get("removedCount")).toBe("1");
    });
  });
});
