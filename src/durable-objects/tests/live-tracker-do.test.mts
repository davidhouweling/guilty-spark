import { describe, beforeEach, it, expect, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import type { APIGroupDMChannel, APIChannel } from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import { LiveTrackerDO, type LiveTrackerStartData, type LiveTrackerState } from "../live-tracker-do.mjs";
import { installFakeServicesWith } from "../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";
import type { Services } from "../../services/install.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import { aGuildMemberWith, apiMessage, guild } from "../../services/discord/fakes/data.mjs";
import { aFakeDurableObjectId } from "../fakes/live-tracker-do.fake.mjs";
import { aFakeGuildConfigRow } from "../../services/database/fakes/database.fake.mjs";
import { matchStats } from "../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../base/preconditions.mjs";

// Create a mock SQL storage that satisfies the interface without using runtime types
const createMockSqlStorage = (): SqlStorage => {
  return {
    exec: vi.fn(),
    databaseSize: 0,
    Cursor: vi.fn() as never, // Mock constructor
    Statement: vi.fn() as never, // Mock constructor
  } as SqlStorage;
};

// Helper to create mock with proper types and access to mock functions
const createMockDurableObjectState = (): {
  durableObjectState: DurableObjectState;
  mocks: { storage: typeof mockStorage };
} => {
  const mockStorage = {
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
  };

  const mockDurableObjectState = {
    storage: mockStorage,
    abort: vi.fn(),
    acceptWebSocket: vi.fn(),
    blockConcurrencyWhile: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(),
    getTags: vi.fn(),
    getWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponseTimestamp: vi.fn(),
    getWebSockets: vi.fn(),
    id: aFakeDurableObjectId(),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
    waitUntil: vi.fn(),
  } as DurableObjectState;

  // Return both the properly typed object and mock accessor functions
  return {
    durableObjectState: mockDurableObjectState,
    mocks: {
      storage: mockStorage,
    },
  };
};

const createBaseTestData = (): Omit<LiveTrackerStartData, "interactionToken"> => ({
  userId: "test-user-id",
  guildId: "test-guild-id",
  channelId: "test-channel-id",
  queueNumber: 42,
  liveMessageId: "test-message-id",
  queueStartTime: new Date().toISOString(),
  teams: [
    {
      name: "Eagle",
      players: [
        aGuildMemberWith({
          user: {
            id: "player1",
            username: "Player1",
            discriminator: "0001",
            avatar: null,
            global_name: null,
          },
          nick: "Player1",
        }),
      ],
    },
    {
      name: "Cobra",
      players: [
        aGuildMemberWith({
          user: {
            id: "player2",
            username: "Player2",
            discriminator: "0002",
            avatar: null,
            global_name: null,
          },
          nick: "Player2",
        }),
      ],
    },
  ],
});

const createMockStartData = (): LiveTrackerStartData => ({
  ...createBaseTestData(),
  interactionToken: "test-token",
});

const createMockTrackerState = (): LiveTrackerState => ({
  ...createBaseTestData(),
  isPaused: false,
  status: "active",
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  checkCount: 1,
  substitutions: [],
  discoveredMatches: {},
  rawMatches: {},
  errorState: {
    consecutiveErrors: 0,
    backoffMinutes: 3,
    lastSuccessTime: new Date().toISOString(),
  },
  lastMessageState: {
    matchCount: 0,
    substitutionCount: 0,
  },
});

const createAlarmTestTrackerState = (overrides: Partial<LiveTrackerState> = {}): LiveTrackerState => ({
  guildId: "guild-123",
  channelId: "channel-456",
  userId: "user-789",
  queueNumber: 123,
  status: "active",
  isPaused: false,
  checkCount: 0,
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  liveMessageId: "message-123",
  queueStartTime: new Date(Date.now() - 60000).toISOString(),
  teams: [
    {
      name: "Team 1",
      players: [
        aGuildMemberWith({
          user: {
            id: "user1",
            username: "player1",
            discriminator: "0001",
            avatar: null,
            global_name: "Player One",
          },
          nick: null,
        }),
      ],
    },
  ],
  substitutions: [],
  discoveredMatches: {},
  rawMatches: {},
  errorState: {
    consecutiveErrors: 0,
    lastErrorMessage: undefined,
    backoffMinutes: 0,
    lastSuccessTime: new Date().toISOString(),
  },
  lastMessageState: {
    matchCount: 0,
    substitutionCount: 0,
  },
  ...overrides,
});

const aFakeStateWith = (overrides: Partial<LiveTrackerState> = {}): LiveTrackerState => ({
  guildId: "test-guild-id",
  channelId: "test-channel-id",
  userId: "test-user-id",
  queueNumber: 123,
  status: "active",
  isPaused: false,
  checkCount: 0,
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  liveMessageId: "test-message-id",
  queueStartTime: new Date(Date.now() - 60000).toISOString(),
  teams: [
    {
      name: "Team 1",
      players: [
        aGuildMemberWith({
          user: {
            id: "user1",
            username: "player1",
            discriminator: "0001",
            avatar: null,
            global_name: "Player One",
          },
          nick: null,
        }),
      ],
    },
  ],
  substitutions: [],
  discoveredMatches: {},
  rawMatches: {},
  errorState: {
    consecutiveErrors: 0,
    lastErrorMessage: undefined,
    backoffMinutes: 0,
    lastSuccessTime: new Date().toISOString(),
  },
  lastMessageState: {
    matchCount: 0,
    substitutionCount: 0,
  },
  ...overrides,
});

describe("LiveTrackerDO", () => {
  let liveTrackerDO: LiveTrackerDO;
  let mockState: DurableObjectState;
  let mockStorage: {
    get: MockInstance<(key: string) => Promise<LiveTrackerState | null>>;
    put: MockInstance<(key: string, value: LiveTrackerState) => Promise<void>>;
    delete: MockInstance<(key: string) => Promise<boolean>>;
    deleteAll: MockInstance<() => Promise<void>>;
    setAlarm: MockInstance<(scheduledTime: number) => Promise<void>>;
    getAlarm: MockInstance<() => Promise<number | null>>;
    deleteAlarm: MockInstance<() => Promise<boolean>>;
  };
  let services: Services;
  let env: Env;

  beforeEach(() => {
    const mockSetup = createMockDurableObjectState();
    mockState = mockSetup.durableObjectState;
    mockStorage = mockSetup.mocks.storage;
    services = installFakeServicesWith();
    env = aFakeEnvWith();

    liveTrackerDO = new LiveTrackerDO(mockState, env, () => services);
  });

  describe("constructor", () => {
    it("initializes services correctly", () => {
      expect(liveTrackerDO).toBeInstanceOf(LiveTrackerDO);
    });
  });

  describe("fetch()", () => {
    it("routes to handleStart for /start endpoint", async () => {
      mockStorage.get.mockResolvedValue(null);
      vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);

      const startData = createMockStartData();
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(startData),
      });

      const response = await liveTrackerDO.fetch(request);

      expect(response.status).toBe(200);
    });

    it("routes to handlePause for /pause endpoint", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleResume for /resume endpoint", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleStop for /stop endpoint", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleRefresh for /refresh endpoint", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleStatus for /status endpoint", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleRepost for /repost endpoint", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("returns 404 for unknown endpoints", async () => {
      const request = new Request("http://do/unknown", { method: "GET" });

      const response = await liveTrackerDO.fetch(request);

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("handles errors gracefully", async () => {
      mockStorage.get.mockRejectedValue(new Error("Storage error"));
      const request = new Request("http://do/status", { method: "GET" });

      const response = await liveTrackerDO.fetch(request);

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Internal Server Error");
    });
  });

  describe("handleStart()", () => {
    it("creates new tracker state and sets alarm", async () => {
      const startData = createMockStartData();
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(startData),
      });

      vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const response = await liveTrackerDO.fetch(request);

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(mockStorage.put).toHaveBeenCalled();
      expect(mockStorage.setAlarm).toHaveBeenCalled();
    });

    it("handles Discord API errors", async () => {
      const startData = createMockStartData();
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(startData),
      });

      vi.spyOn(services.discordService, "createMessage").mockRejectedValue(
        new DiscordError(404, { message: "Test error", code: 0 }),
      );

      const response = await liveTrackerDO.fetch(request);

      expect(response.status).toBe(200);
      const data: { success: boolean } = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("handlePause()", () => {
    it("pauses active tracker", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "active";
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(mockStorage.put).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns error if tracker already paused", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("handleResume()", () => {
    it("resumes paused tracker", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(mockStorage.put).toHaveBeenCalled();
      expect(mockStorage.setAlarm).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns error if tracker is not paused", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "active";
      trackerState.isPaused = false;
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("handleStop()", () => {
    it("stops active tracker", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(mockStorage.deleteAll).toHaveBeenCalled();
      expect(mockStorage.deleteAlarm).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });
  });

  describe("handleRefresh()", () => {
    it("forces immediate update of active tracker", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
    });

    it("returns error if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("creates new message during refresh when new matches are detected", async () => {
      const trackerState = createMockTrackerState();
      trackerState.lastMessageState = {
        matchCount: 0,
        substitutionCount: 0,
      };
      trackerState.discoveredMatches = {};
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-refresh-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage");

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
      expect(createMessageSpy).toHaveBeenCalled();
      expect(deleteMessageSpy).toHaveBeenCalled();
      expect(editMessageSpy).not.toHaveBeenCalled();
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
    });

    it("edits existing message during refresh when no new content is detected", async () => {
      const trackerState = createMockTrackerState();
      trackerState.lastMessageState = {
        matchCount: 0,
        substitutionCount: 0,
      };
      trackerState.discoveredMatches = {};
      mockStorage.get.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage");
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage");
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
      expect(editMessageSpy).toHaveBeenCalled();
      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(deleteMessageSpy).not.toHaveBeenCalled();
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleStatus()", () => {
    it("returns current tracker state", async () => {
      const trackerState = createMockTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ state: trackerState });
    });

    it("returns 404 if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });
  });

  describe("handleRepost()", () => {
    it("updates live message ID with new message ID", async () => {
      const trackerState = aFakeStateWith({
        liveMessageId: "old-message-id",
        status: "active",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        oldMessageId: "old-message-id",
        newMessageId: "new-message-id",
      });

      expect(mockStorage.put).toHaveBeenCalledWith("trackerState", {
        ...trackerState,
        liveMessageId: "new-message-id",
        lastUpdateTime: expect.any(String) as string,
      });
    });

    it("handles case when old message ID is undefined", async () => {
      const trackerState = aFakeStateWith({
        liveMessageId: undefined,
        status: "active",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        oldMessageId: "none",
        newMessageId: "new-message-id",
      });
    });

    it("returns 404 if no tracker exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns 400 for stopped tracker", async () => {
      const trackerState = aFakeStateWith({
        status: "stopped",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("Cannot repost for stopped tracker");
    });

    it("returns 400 for empty message ID", async () => {
      const trackerState = aFakeStateWith({
        status: "active",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "" }),
        }),
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("New message ID is required");
    });

    it("returns 400 for whitespace-only message ID", async () => {
      const trackerState = aFakeStateWith({
        status: "active",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "   " }),
        }),
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("New message ID is required");
    });

    it("works with paused tracker", async () => {
      const trackerState = aFakeStateWith({
        status: "paused",
        liveMessageId: "old-message-id",
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        oldMessageId: "old-message-id",
        newMessageId: "new-message-id",
      });
    });
  });

  describe("alarm()", () => {
    it("handles alarm when tracker is inactive", async () => {
      const state = aFakeStateWith({
        status: "stopped",
        isPaused: false,
      });
      mockStorage.get.mockResolvedValue(state);

      await liveTrackerDO.alarm();

      expect(mockStorage.setAlarm).not.toHaveBeenCalled();
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it("handles alarm when tracker is paused", async () => {
      const state = aFakeStateWith({
        status: "active",
        isPaused: true,
      });
      mockStorage.get.mockResolvedValue(state);

      await liveTrackerDO.alarm();

      expect(mockStorage.setAlarm).not.toHaveBeenCalled();
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it("handles alarm when no tracker state exists", async () => {
      mockStorage.get.mockResolvedValue(null);

      await liveTrackerDO.alarm();

      expect(mockStorage.setAlarm).not.toHaveBeenCalled();
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it("processes active tracker alarm successfully", async () => {
      const trackerState: LiveTrackerState = {
        guildId: "guild-123",
        channelId: "channel-456",
        userId: "user-789",
        queueNumber: 123,
        status: "active",
        isPaused: false,
        checkCount: 0,
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        liveMessageId: "message-123",
        queueStartTime: new Date(Date.now() - 60000).toISOString(),
        teams: [
          {
            name: "Team 1",
            players: [
              aGuildMemberWith({
                user: {
                  id: "user1",
                  username: "player1",
                  discriminator: "0001",
                  avatar: null,
                  global_name: "Player One",
                },
                nick: null,
              }),
            ],
          },
          {
            name: "Team 2",
            players: [
              aGuildMemberWith({
                user: {
                  id: "user2",
                  username: "player2",
                  discriminator: "0002",
                  avatar: null,
                  global_name: null,
                },
                nick: "Player Two",
              }),
            ],
          },
        ],
        substitutions: [],
        discoveredMatches: {},
        rawMatches: {},
        errorState: {
          consecutiveErrors: 0,
          lastErrorMessage: undefined,
          backoffMinutes: 0,
          lastSuccessTime: new Date().toISOString(),
        },
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
      };
      mockStorage.get.mockResolvedValue(trackerState);

      const guildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTrackingChannelName: "N",
      });
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);

      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      const mockChannel = {
        id: "channel-456",
        name: "test-queue",
        type: 0,
      } as APIChannel;
      vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
      vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);

      // Mock permission check components
      vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
      vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(aGuildMemberWith({}));
      vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({
        hasAll: true,
        missing: [],
      });

      await liveTrackerDO.alarm();

      expect(mockStorage.get).toHaveBeenCalledWith("trackerState");
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          discoveredMatches: expect.objectContaining({
            "9535b946-f30c-4a43-b852-000000slayer": expect.objectContaining({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: expect.any(String) as string,
              duration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
              endTime: expect.any(Date) as Date,
            }) as MatchStats,
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.objectContaining({
              matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
              gameTypeAndMap: expect.any(String) as string,
              duration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
              endTime: expect.any(Date) as Date,
            }) as MatchStats,
          }) as LiveTrackerState["discoveredMatches"],
          rawMatches: expect.objectContaining({
            "9535b946-f30c-4a43-b852-000000slayer": expect.objectContaining({
              MatchId: "9535b946-f30c-4a43-b852-000000slayer",
            }) as MatchStats,
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.objectContaining({
              MatchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
            }) as MatchStats,
          }) as LiveTrackerState["rawMatches"],
          lastMessageState: expect.objectContaining({
            matchCount: 0,
            substitutionCount: 0,
          }) as LiveTrackerState["lastMessageState"],
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: expect.stringContaining("Discord update failed") as string,
          }) as LiveTrackerState["errorState"],
        }),
      );
      expect(mockStorage.setAlarm).toHaveBeenCalledWith(expect.any(Number));
    });

    it("handles fetch error and continues if not persistent", async () => {
      const trackerState = createAlarmTestTrackerState({
        checkCount: 0,
        errorState: {
          consecutiveErrors: 0,
          lastErrorMessage: undefined,
          backoffMinutes: 0,
          lastSuccessTime: new Date().toISOString(),
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockRejectedValue(new Error("Network error"));
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: "Error: Network error",
          }) as LiveTrackerState["errorState"],
        }),
      );
      expect(mockStorage.setAlarm).toHaveBeenCalled();
      expect(mockStorage.deleteAll).not.toHaveBeenCalled();
    });

    it("stops tracker when persistent errors exceed threshold", async () => {
      const trackerState = createAlarmTestTrackerState({
        errorState: {
          consecutiveErrors: 9,
          lastErrorMessage: "Previous error",
          backoffMinutes: 8,
          lastSuccessTime: new Date().toISOString(),
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockRejectedValue(new Error("Persistent error"));

      await liveTrackerDO.alarm();

      expect(mockStorage.deleteAlarm).toHaveBeenCalled();
      expect(mockStorage.deleteAll).toHaveBeenCalled();
      expect(mockStorage.setAlarm).not.toHaveBeenCalled();
    });

    it("handles Discord channel not found error and stops tracker", async () => {
      const trackerState = createAlarmTestTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");

      const discordError = new DiscordError(404, { code: 10003, message: "Unknown channel" });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);
      vi.spyOn(services.discordService, "createMessage").mockRejectedValue(discordError);

      await liveTrackerDO.alarm();

      expect(mockStorage.deleteAlarm).toHaveBeenCalled();
      expect(mockStorage.deleteAll).toHaveBeenCalled();
      expect(mockStorage.setAlarm).not.toHaveBeenCalled();
    });

    it("handles Discord update error and continues", async () => {
      const trackerState = createAlarmTestTrackerState();
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      const discordError = new DiscordError(500, { code: 0, message: "Internal server error" });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: expect.stringContaining("Discord update failed") as string,
          }) as LiveTrackerState["errorState"],
        }),
      );
      expect(mockStorage.setAlarm).toHaveBeenCalled();
      expect(mockStorage.deleteAll).not.toHaveBeenCalled();
    });

    it("handles alarm when no live message exists", async () => {
      const trackerState = createAlarmTestTrackerState({
        liveMessageId: undefined,
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
        }),
      );
      expect(mockStorage.setAlarm).toHaveBeenCalled();
    });

    it("persists discovered matches when handling substitutions", async () => {
      const existingState = createAlarmTestTrackerState({
        discoveredMatches: {
          "existing-match-id": {
            matchId: "existing-match-id",
            gameTypeAndMap: "Slayer on Aquarius",
            duration: "7m 30s",
            gameScore: "50:47",
            endTime: new Date("2024-01-01T10:00:00Z"),
          },
        },
        rawMatches: {
          "existing-match-id": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      mockStorage.get.mockResolvedValue(existingState);

      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          discoveredMatches: expect.objectContaining({
            "existing-match-id": expect.any(Object) as Record<string, unknown>,
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.any(Object) as Record<string, unknown>,
          }) as LiveTrackerState["discoveredMatches"],
          rawMatches: expect.objectContaining({
            "existing-match-id": expect.any(Object) as Record<string, unknown>,
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.any(Object) as Record<string, unknown>,
          }) as LiveTrackerState["rawMatches"],
        }),
      );
    });

    it("handles substitutions without losing match data", async () => {
      const existingState = createAlarmTestTrackerState({
        substitutions: [
          {
            playerOutId: "user1",
            playerInId: "user2",
            teamIndex: 0,
            teamName: "Team Alpha",
            timestamp: new Date("2024-01-01T10:00:00Z").toISOString(),
          },
        ],
        discoveredMatches: {
          "pre-sub-match": {
            matchId: "pre-sub-match",
            gameTypeAndMap: "CTF on Catalyst",
            duration: "8m 45s",
            gameScore: "3:2",
            endTime: new Date("2024-01-01T10:00:00Z"),
          },
        },
        rawMatches: {
          "pre-sub-match": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      mockStorage.get.mockResolvedValue(existingState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          substitutions: expect.arrayContaining([
            expect.objectContaining({
              playerOutId: "user1",
              playerInId: "user2",
              teamIndex: 0,
              teamName: "Team Alpha",
            }),
          ]) as LiveTrackerState["substitutions"],
          discoveredMatches: expect.objectContaining({
            "pre-sub-match": expect.any(Object) as Record<string, unknown>,
          }) as LiveTrackerState["discoveredMatches"],
          rawMatches: expect.objectContaining({
            "pre-sub-match": expect.any(Object) as Record<string, unknown>,
          }) as LiveTrackerState["rawMatches"],
        }),
      );
    });

    it("handles general alarm error gracefully", async () => {
      mockStorage.get.mockRejectedValue(new Error("Storage error"));
      const errorSpy = vi.spyOn(services.logService, "error").mockImplementation(() => undefined);

      await liveTrackerDO.alarm();

      expect(errorSpy).toHaveBeenCalledWith("LiveTracker alarm error:", expect.any(Map));
    });

    it("creates new message when new matches are detected", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        discoveredMatches: {},
        rawMatches: {},
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage");

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.objectContaining({})]) as Record<string, unknown>[],
        }),
      );
      expect(deleteMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        "message-123",
        "Replaced with updated live tracker message",
      );
      expect(editMessageSpy).not.toHaveBeenCalled();

      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          liveMessageId: "new-message-id",
          lastMessageState: {
            matchCount: 1,
            substitutionCount: 0,
          },
        }),
      );
    });

    it("creates new message when new substitutions are detected", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        substitutions: [
          {
            playerOutId: "old-player",
            playerInId: "new-player",
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: new Date().toISOString(),
          },
        ],
        discoveredMatches: {},
        rawMatches: {},
      });
      mockStorage.get.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage");

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.objectContaining({})]) as Record<string, unknown>[],
        }),
      );
      expect(deleteMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        "message-123",
        "Replaced with updated live tracker message",
      );
      expect(editMessageSpy).not.toHaveBeenCalled();

      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          liveMessageId: "new-message-id",
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 1,
          },
        }),
      );
    });

    it("edits existing message when no new matches or substitutions detected", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 1,
          substitutionCount: 0,
        },
        discoveredMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": {
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
            gameTypeAndMap: "Slayer on Aquarius",
            duration: "5m 00s",
            gameScore: "50:49",
            endTime: new Date("2024-01-01T10:00:00Z"),
          },
        },
        rawMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
            matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
          ),
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage");
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage");
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      expect(editMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        trackerState.liveMessageId,
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.objectContaining({})]) as Record<string, unknown>[],
        }),
      );
      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(deleteMessageSpy).not.toHaveBeenCalled();

      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          lastMessageState: {
            matchCount: 1,
            substitutionCount: 0,
          },
        }),
      );
    });

    it("handles delete message failure gracefully when creating new message", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        discoveredMatches: {},
        rawMatches: {},
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");
      const warnSpy = vi.spyOn(services.logService, "warn").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi
        .spyOn(services.discordService, "deleteMessage")
        .mockRejectedValue(new Error("Cannot delete message"));

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalled();
      expect(deleteMessageSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith("Failed to delete old live tracker message", expect.any(Map));
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          liveMessageId: "new-message-id",
        }),
      );
    });

    it("updates lastMessageState correctly when both matches and substitutions are added", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 1,
          substitutionCount: 1,
        },
        substitutions: [
          {
            playerOutId: "old-player-1",
            playerInId: "new-player-1",
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: new Date().toISOString(),
          },
          {
            playerOutId: "old-player-2",
            playerInId: "new-player-2",
            teamIndex: 1,
            teamName: "Team 2",
            timestamp: new Date().toISOString(),
          },
        ],
        discoveredMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": {
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
            gameTypeAndMap: "Slayer on Aquarius",
            duration: "5m 00s",
            gameScore: "50:49",
            endTime: new Date("2024-01-01T10:00:00Z"),
          },
        },
        rawMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
            matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
          ),
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const guildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTrackingChannelName: "Y",
      });
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);

      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap")
        .mockResolvedValueOnce("Slayer on Aquarius")
        .mockResolvedValueOnce("CTF on Bazaar");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValueOnce("5:00").mockReturnValueOnce("7:30");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValueOnce("50:49").mockReturnValueOnce("3:2");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

      const mockChannel = {
        id: "channel-456",
        name: "test-queue",
        type: 0,
      } as APIChannel;
      vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
      vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);

      // Mock permission check components
      vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
      vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(aGuildMemberWith({}));
      vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({
        hasAll: true,
        missing: [],
      });

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalled();
      expect(mockStorage.put).toHaveBeenCalledTimes(1);
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          lastMessageState: {
            matchCount: 2,
            substitutionCount: 2,
          },
        }),
      );
    });
  });

  describe("Channel name updates", (): void => {
    beforeEach((): void => {
      const guildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTrackingChannelName: "Y",
      });
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);
    });

    describe("during alarm processing", (): void => {
      it("updates channel name with series score when enabled", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel",
          type: 0,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);

        // Mock permission check components
        vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
        vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(aGuildMemberWith({}));
        vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({
          hasAll: true,
          missing: [],
        });

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");
        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
          ...apiMessage,
          id: "new-message-id",
        });
        vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        await liveTrackerDO.alarm();

        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).toHaveBeenCalledWith("test-channel-id", {
          name: "my-queue-channel┊1﹕0",
          reason: "Live Tracker: Updated series score to 1:0",
        });
      });

      it("removes existing series score before adding new one", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel┊0﹕1",
          type: 0,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);

        // Mock permission check components
        vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
        vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(aGuildMemberWith({}));
        vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({
          hasAll: true,
          missing: [],
        });

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50:49");
        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
          ...apiMessage,
          id: "new-message-id",
        });
        vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        await liveTrackerDO.alarm();

        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).toHaveBeenCalledWith("test-channel-id", {
          name: "my-queue-channel┊1﹕0",
          reason: "Live Tracker: Updated series score to 1:0",
        });
      });

      it("skips channel name update when disabled in guild config", async (): Promise<void> => {
        const guildConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTrackingChannelName: "N",
        });
        vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);

        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const getChannelSpy = vi.spyOn(services.discordService, "getChannel");
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");

        await liveTrackerDO.alarm();

        expect(getChannelSpy).not.toHaveBeenCalled();
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });

      it("logs error when channel update fails", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel",
          type: 0,
        };
        vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
        vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(aGuildMemberWith());
        vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({ hasAll: true, missing: [] });
        vi.spyOn(services.discordService, "updateChannel").mockRejectedValue(new Error("Discord API error"));
        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
          ...apiMessage,
          id: "new-message-id",
        });
        vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const errorSpy = vi.spyOn(services.logService, "error").mockImplementation(() => undefined);

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");

        await liveTrackerDO.alarm();

        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to update channel name",
          new Map([
            ["channelId", "test-channel-id"],
            ["error", "Error: Discord API error"],
          ]),
        );
      });

      it("skips update when channel name hasn't changed", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel (1:0)",
          type: 0,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");
        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
          ...apiMessage,
          id: "new-message-id",
        });
        vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");

        await liveTrackerDO.alarm();

        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });

      it("handles DM channel name gracefully", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
          isPaused: false,
          discoveredMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": {
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer on Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00Z"),
            },
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel: APIGroupDMChannel = {
          id: "test-channel-id",
          name: null,
          type: ChannelType.GroupDM,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);
        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
          ...apiMessage,
          id: "new-message-id",
        });
        vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");

        await liveTrackerDO.alarm();

        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });
    });

    describe("when live tracker stops", (): void => {
      it("resets channel name by removing series score", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel (2:1)",
          type: 0,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel").mockResolvedValue(mockChannel);

        const response = await liveTrackerDO.fetch(new Request("https://example.com/stop"));

        expect(response.status).toBe(200);
        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).toHaveBeenCalledWith("test-channel-id", {
          name: "my-queue-channel",
          reason: "Live Tracker: Stopped - removed series score",
        });
      });

      it("skips reset when channel name has no series score", async (): Promise<void> => {
        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const mockChannel = {
          id: "test-channel-id",
          name: "my-queue-channel",
          type: 0,
        };
        const getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(mockChannel);
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");

        const response = await liveTrackerDO.fetch(new Request("https://example.com/stop"));

        expect(response.status).toBe(200);
        expect(getChannelSpy).toHaveBeenCalledWith("test-channel-id");
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });

      it("skips reset when channel name updates are disabled", async (): Promise<void> => {
        const guildConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTrackingChannelName: "N",
        });
        vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);

        const trackerState = aFakeStateWith({
          guildId: "test-guild-id",
          channelId: "test-channel-id",
          status: "active",
        });
        mockStorage.get.mockResolvedValue(trackerState);

        const getChannelSpy = vi.spyOn(services.discordService, "getChannel");
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");

        const response = await liveTrackerDO.fetch(new Request("https://example.com/stop"));

        expect(response.status).toBe(200);
        expect(getChannelSpy).not.toHaveBeenCalled();
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });
    });
  });
});
