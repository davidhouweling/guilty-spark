import { describe, beforeEach, it, expect, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import type { APIGroupDMChannel, APIChannel, APIGuildMember } from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import { LiveTrackerDO } from "../live-tracker-do.mjs";
import { installFakeServicesWith } from "../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";
import type { Services } from "../../services/install.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import { aGuildMemberWith, apiMessage, guild } from "../../services/discord/fakes/data.mjs";
import { aFakeDurableObjectId } from "../fakes/live-tracker-do.fake.mjs";
import { aFakeGuildConfigRow } from "../../services/database/fakes/database.fake.mjs";
import { matchStats } from "../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { LiveTrackerStartRequest, LiveTrackerState } from "../types.mjs";

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
    kv: {} as unknown as DurableObjectStorage["kv"],
  };

  const mockDurableObjectState: DurableObjectState = {
    storage: mockStorage,
    props: {},
    abort: () => void 0,
    acceptWebSocket: () => void 0,
    blockConcurrencyWhile: async (cb) => cb(),
    getHibernatableWebSocketEventTimeout: () => 0,
    getTags: () => [],
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    getWebSockets: () => [],
    id: aFakeDurableObjectId(),
    setHibernatableWebSocketEventTimeout: () => void 0,
    setWebSocketAutoResponse: () => void 0,
    waitUntil: () => void 0,
  };

  // Return both the properly typed object and mock accessor functions
  return {
    durableObjectState: mockDurableObjectState,
    mocks: {
      storage: mockStorage,
    },
  };
};

// Helper function to create a player with minimal boilerplate
const createTestPlayer = (
  id: string,
  username: string,
  discriminator: string,
  globalName?: string | null,
): APIGuildMember =>
  aGuildMemberWith({
    user: {
      id,
      username,
      discriminator,
      avatar: null,
      global_name: globalName ?? null,
    },
    nick: null,
  });

// Helper function to create 8-player setup for tests that need it
const createEightPlayerSetup = (): {
  players: Record<string, APIGuildMember>;
  teams: { name: string; playerIds: string[] }[];
} => ({
  players: {
    user1: createTestPlayer("user1", "player1", "0001", "Player One"),
    user2: createTestPlayer("user2", "player2", "0002"),
    user3: createTestPlayer("user3", "player3", "0003"),
    user4: createTestPlayer("user4", "player4", "0004"),
    user5: createTestPlayer("user5", "player5", "0005"),
    user6: createTestPlayer("user6", "player6", "0006"),
    user7: createTestPlayer("user7", "player7", "0007"),
    user8: createTestPlayer("user8", "player8", "0008"),
  },
  teams: [
    { name: "Team 1", playerIds: ["user1", "user2", "user3", "user4"] },
    { name: "Team 2", playerIds: ["user5", "user6", "user7", "user8"] },
  ],
});

const createBaseTestData = (): Omit<LiveTrackerStartRequest, "interactionToken"> => ({
  userId: "test-user-id",
  guildId: "test-guild-id",
  channelId: "test-channel-id",
  queueNumber: 42,
  liveMessageId: "test-message-id",
  queueStartTime: new Date().toISOString(),
  players: {
    player1: createTestPlayer("player1", "Player1", "0001"),
    player2: createTestPlayer("player2", "Player2", "0002"),
  },
  teams: [
    {
      name: "Eagle",
      playerIds: ["player1"],
    },
    {
      name: "Cobra",
      playerIds: ["player2"],
    },
  ],
});

const createMockStartData = (): LiveTrackerStartRequest => ({
  ...createBaseTestData(),
  interactionToken: "test-token",
});

const createMockTrackerState = (): LiveTrackerState => ({
  ...createBaseTestData(),
  isPaused: false,
  status: "active",
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  searchStartTime: new Date().toISOString(),
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

const aMatchSummaryWith = (
  overrides: Partial<LiveTrackerState["discoveredMatches"][string]> = {},
): LiveTrackerState["discoveredMatches"][string] => ({
  matchId: "match-id",
  gameTypeAndMap: "Slayer: Recharge",
  gameType: "Slayer",
  gameTypeIconUrl: "data:,",
  gameTypeThumbnailUrl: "data:,",
  gameMap: "Recharge",
  gameMapThumbnailUrl: "data:,",
  duration: "7m 30s",
  gameScore: "50:47",
  gameSubScore: null,
  endTime: new Date("2024-01-01T00:00:00.000Z").toISOString(),
  ...overrides,
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
  searchStartTime: new Date(Date.now() - 60000).toISOString(),
  liveMessageId: "message-123",
  players: {
    user1: createTestPlayer("user1", "player1", "0001", "Player One"),
  },
  teams: [
    {
      name: "Team 1",
      playerIds: ["user1"],
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
  searchStartTime: new Date(Date.now() - 60000).toISOString(),
  liveMessageId: "test-message-id",
  players: {
    user1: createTestPlayer("user1", "player1", "0001", "Player One"),
  },
  teams: [
    {
      name: "Team 1",
      playerIds: ["user1"],
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

const createMockTrackerStateWithMatches = (): LiveTrackerState => {
  const baseState = createMockTrackerState();
  return {
    ...baseState,
    discoveredMatches: {
      match1: aMatchSummaryWith({
        matchId: "match1",
        gameTypeAndMap: "Slayer: Recharge",
        gameType: "Slayer",
        gameMap: "Recharge",
        duration: "7m 30s",
        gameScore: "50:47",
        endTime: new Date("2024-01-01T00:00:00.000Z").toISOString(),
      }),
      match2: aMatchSummaryWith({
        matchId: "match2",
        gameTypeAndMap: "Slayer: Streets",
        gameType: "Slayer",
        gameMap: "Streets",
        duration: "8m 15s",
        gameScore: "50:42",
        endTime: new Date("2024-01-01T00:10:00.000Z").toISOString(),
      }),
    },
    rawMatches: {
      match1: {} as MatchStats, // Mock raw match data
      match2: {} as MatchStats, // Mock raw match data
    },
  };
};

describe("LiveTrackerDO", () => {
  let liveTrackerDO: LiveTrackerDO;
  let mockState: DurableObjectState;
  let mockStorage: DurableObjectStorage;
  let services: Services;
  let env: Env;
  let storageGetSpy: MockInstance<(key: string) => Promise<LiveTrackerState | null>>;
  let storagePutSpy: MockInstance<(key: string, value: LiveTrackerState) => Promise<void>>;
  let storageSetAlarmSpy: MockInstance<typeof mockStorage.setAlarm>;
  let storageDeleteAllSpy: MockInstance<typeof mockStorage.deleteAll>;
  let storageDeleteAlarmSpy: MockInstance<typeof mockStorage.deleteAlarm>;

  beforeEach(() => {
    const mockSetup = createMockDurableObjectState();
    mockState = mockSetup.durableObjectState;
    mockStorage = mockSetup.mocks.storage;
    services = installFakeServicesWith();
    env = aFakeEnvWith();

    storageGetSpy = vi.spyOn(mockStorage, "get");
    storagePutSpy = vi.spyOn(mockStorage, "put");
    storageSetAlarmSpy = vi.spyOn(mockStorage, "setAlarm");
    storageDeleteAllSpy = vi.spyOn(mockStorage, "deleteAll");
    storageDeleteAlarmSpy = vi.spyOn(mockStorage, "deleteAlarm");

    liveTrackerDO = new LiveTrackerDO(mockState, env, () => services);
  });

  describe("constructor", () => {
    it("initializes services correctly", () => {
      expect(liveTrackerDO).toBeInstanceOf(LiveTrackerDO);
    });
  });

  describe("fetch()", () => {
    it("routes to handleStart for /start endpoint", async () => {
      storageGetSpy.mockResolvedValue(null);
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
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleResume for /resume endpoint", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleStop for /stop endpoint", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleRefresh for /refresh endpoint", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleStatus for /status endpoint", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
    });

    it("routes to handleRepost for /repost endpoint", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/repost", {
          method: "POST",
          body: JSON.stringify({ newMessageId: "new-message-id" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("routes to handleSubstitution for /substitution endpoint", async () => {
      const trackerState = createAlarmTestTrackerState({
        players: {
          player1: createTestPlayer("player1", "player1", "0001", "Player One"),
        },
        teams: [
          {
            name: "Team Alpha",
            playerIds: ["player1"],
          },
        ],
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const response = await liveTrackerDO.fetch(
        new Request("http://do/substitution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerOutId: "player1", playerInId: "newplayer" }),
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
      storageGetSpy.mockRejectedValue(new Error("Storage error"));
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
      expect(storagePutSpy).toHaveBeenCalled();
      expect(storageSetAlarmSpy).toHaveBeenCalled();
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
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(storagePutSpy).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns error if tracker already paused", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns enriched embed data when tracker has discovered matches", async () => {
      const trackerState = createMockTrackerStateWithMatches();
      trackerState.status = "active";
      storageGetSpy.mockResolvedValue(trackerState);

      // Mock the service dependencies - return empty array since matches are already discovered
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown; embedData?: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(data.embedData).toBeDefined();
      const embedData = data.embedData as Record<string, unknown>;
      expect(embedData).toMatchObject({
        status: "paused",
        isPaused: true,
        seriesScore: "2:1",
      });
      expect(Array.isArray(embedData["enrichedMatches"])).toBe(true);
    });

    it("returns basic state when tracker has no discovered matches", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "active";
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown; embedData?: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(data.embedData).toBeUndefined();
    });
  });

  describe("handleResume()", () => {
    it("resumes paused tracker", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(storagePutSpy).toHaveBeenCalled();
      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns error if tracker is not paused", async () => {
      const trackerState = createMockTrackerState();
      trackerState.status = "active";
      trackerState.isPaused = false;
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns enriched embed data when tracker has discovered matches", async () => {
      const trackerState = createMockTrackerStateWithMatches();
      trackerState.status = "paused";
      trackerState.isPaused = true;
      storageGetSpy.mockResolvedValue(trackerState);

      // Mock the service dependencies - return empty array since matches are already discovered
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      const response = await liveTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown; embedData?: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(data.embedData).toBeDefined();
      const embedData = data.embedData as Record<string, unknown>;
      expect(embedData).toMatchObject({
        status: "active",
        isPaused: false,
        seriesScore: "2:1",
      });
      expect(Array.isArray(embedData["enrichedMatches"])).toBe(true);
      expect(embedData["nextCheck"]).toBeDefined();
    });
  });

  describe("handleStop()", () => {
    it("stops active tracker", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(storageDeleteAllSpy).toHaveBeenCalled();
      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });

    it("returns error if no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns enriched embed data when tracker has discovered matches", async () => {
      const trackerState = createMockTrackerStateWithMatches();
      trackerState.status = "active";
      storageGetSpy.mockResolvedValue(trackerState);

      // Mock the service dependencies - return empty array since matches are already discovered
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      const response = await liveTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown; embedData?: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(data.embedData).toBeDefined();
      const embedData = data.embedData as Record<string, unknown>;
      expect(embedData).toMatchObject({
        status: "stopped",
        isPaused: false,
        seriesScore: "2:1",
      });
      expect(Array.isArray(embedData["enrichedMatches"])).toBe(true);
      expect(embedData["nextCheck"]).toBeUndefined();
      expect(storageDeleteAllSpy).toHaveBeenCalled();
      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });
  });

  describe("handleRefresh()", () => {
    it("forces immediate update of active tracker", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

      expect(response.status).toBe(200);
      const data: { success: boolean; state: unknown } = await response.json();
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
    });

    it("returns error if no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

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
      // Update teams and players to match the mock data (2 teams, 8 players)
      const eightPlayerSetup = createEightPlayerSetup();
      trackerState.teams = eightPlayerSetup.teams;
      trackerState.players = eightPlayerSetup.players;
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
    });

    it("edits existing message during refresh when no new content is detected", async () => {
      const trackerState = createMockTrackerState();
      trackerState.lastMessageState = {
        matchCount: 0,
        substitutionCount: 0,
      };
      trackerState.discoveredMatches = {};
      storageGetSpy.mockResolvedValue(trackerState);

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
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
    });

    describe("refresh cooldown", () => {
      it("blocks refresh when within 30 second cooldown", async () => {
        const trackerState = createMockTrackerState();
        // Set lastRefreshAttempt to 10 seconds ago (within 30 second cooldown)
        trackerState.lastRefreshAttempt = new Date(Date.now() - 10000).toISOString();
        storageGetSpy.mockResolvedValue(trackerState);

        const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

        expect(response.status).toBe(429);
        const data = await response.json();
        expect(data).toEqual({
          success: false,
          error: "cooldown",
          message: expect.stringMatching(/^Refresh cooldown active, next refresh available <t:\d+:R>$/) as string,
        });
      });

      it("allows refresh when cooldown has expired", async () => {
        const trackerState = createMockTrackerState();
        // Set lastRefreshAttempt to 40 seconds ago (beyond 30 second cooldown)
        trackerState.lastRefreshAttempt = new Date(Date.now() - 40000).toISOString();
        storageGetSpy.mockResolvedValue(trackerState);

        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

        const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

        expect(response.status).toBe(200);
        const data: { success: boolean } = await response.json();
        expect(data.success).toBe(true);
      });

      it("allows refresh when no previous refresh attempt exists", async () => {
        const trackerState = createMockTrackerState();
        delete trackerState.lastRefreshAttempt;
        storageGetSpy.mockResolvedValue(trackerState);

        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

        const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));

        expect(response.status).toBe(200);
        const data: { success: boolean } = await response.json();
        expect(data.success).toBe(true);
      });

      it("sets lastRefreshAttempt timestamp when refresh succeeds", async () => {
        const testTrackerState = createMockTrackerState();
        delete testTrackerState.lastRefreshAttempt;
        storageGetSpy.mockResolvedValue(testTrackerState);

        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

        const beforeTime = Date.now();
        const response = await liveTrackerDO.fetch(new Request("http://do/refresh", { method: "POST" }));
        const afterTime = Date.now();

        expect(response.status).toBe(200);
        expect(storagePutSpy).toHaveBeenCalledWith(
          "trackerState",
          expect.objectContaining({
            lastRefreshAttempt: expect.any(String) as string,
          }),
        );

        // Verify the timestamp is within the expected time range by checking it's a valid date string
        const putCalls = storagePutSpy.mock.calls;
        expect(putCalls).toHaveLength(1);
        const [callArg] = putCalls;
        expect(callArg).toBeDefined();
        if (callArg) {
          expect(callArg[1]).toBeDefined();

          // Check that lastRefreshAttempt was set to a valid timestamp string
          const stateArg = callArg[1] as { lastRefreshAttempt?: string };
          expect(stateArg.lastRefreshAttempt).toBeDefined();
          expect(typeof stateArg.lastRefreshAttempt).toBe("string");

          const savedTimestamp = new Date(stateArg.lastRefreshAttempt ?? "").getTime();
          expect(savedTimestamp).toBeGreaterThanOrEqual(beforeTime);
          expect(savedTimestamp).toBeLessThanOrEqual(afterTime);
        }
      });

      it("bypasses cooldown when matchCompleted is true", async () => {
        const trackerState = createMockTrackerState();
        // Set lastRefreshAttempt to 5 seconds ago (within 30 second cooldown)
        trackerState.lastRefreshAttempt = new Date(Date.now() - 5000).toISOString();
        storageGetSpy.mockResolvedValue(trackerState);

        vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

        const response = await liveTrackerDO.fetch(
          new Request("http://do/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchCompleted: true }),
          }),
        );

        expect(response.status).toBe(200);
        const data: { success: boolean } = await response.json();
        expect(data.success).toBe(true);
      });

      it("skips Discord updates when matchCompleted is true", async () => {
        const trackerState = createMockTrackerStateWithMatches();
        trackerState.lastRefreshAttempt = new Date(Date.now() - 5000).toISOString();
        storageGetSpy.mockResolvedValue(trackerState);

        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

        const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const response = await liveTrackerDO.fetch(
          new Request("http://do/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchCompleted: true }),
          }),
        );

        expect(response.status).toBe(200);
        expect(editMessageSpy).not.toHaveBeenCalled();
        expect(createMessageSpy).not.toHaveBeenCalled();
        expect(deleteMessageSpy).not.toHaveBeenCalled();
      });

      it("still updates state when matchCompleted is true", async () => {
        const trackerState = createMockTrackerState();
        trackerState.lastRefreshAttempt = new Date(Date.now() - 5000).toISOString();
        trackerState.checkCount = 5;
        storageGetSpy.mockResolvedValue(trackerState);

        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

        const response = await liveTrackerDO.fetch(
          new Request("http://do/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchCompleted: true }),
          }),
        );

        expect(response.status).toBe(200);
        expect(storagePutSpy).toHaveBeenCalledWith(
          "trackerState",
          expect.objectContaining({
            checkCount: 6,
            lastRefreshAttempt: expect.any(String) as string,
          }),
        );
      });
    });
  });

  describe("handleStatus()", () => {
    it("returns current tracker state", async () => {
      const trackerState = createMockTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ state: trackerState });
    });

    it("returns 404 if no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

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
      storageGetSpy.mockResolvedValue(trackerState);

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

      expect(storagePutSpy).toHaveBeenCalledWith("trackerState", {
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
      storageGetSpy.mockResolvedValue(trackerState);

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
      storageGetSpy.mockResolvedValue(null);

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
      storageGetSpy.mockResolvedValue(trackerState);

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
      storageGetSpy.mockResolvedValue(trackerState);

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
      storageGetSpy.mockResolvedValue(trackerState);

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
      storageGetSpy.mockResolvedValue(trackerState);

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
      storageGetSpy.mockResolvedValue(state);

      await liveTrackerDO.alarm();

      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(storagePutSpy).not.toHaveBeenCalled();
    });

    it("handles alarm when tracker is paused", async () => {
      const state = aFakeStateWith({
        status: "active",
        isPaused: true,
      });
      storageGetSpy.mockResolvedValue(state);

      await liveTrackerDO.alarm();

      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(storagePutSpy).not.toHaveBeenCalled();
    });

    it("handles alarm when no tracker state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      await liveTrackerDO.alarm();

      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(storagePutSpy).not.toHaveBeenCalled();
    });

    it("processes active tracker alarm successfully", async () => {
      const eightPlayerSetup = createEightPlayerSetup();
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
        searchStartTime: new Date(Date.now() - 60000).toISOString(),
        liveMessageId: "message-123",
        ...eightPlayerSetup,
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
      storageGetSpy.mockResolvedValue(trackerState);

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

      expect(storageGetSpy).toHaveBeenCalledWith("trackerState");
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          discoveredMatches: expect.objectContaining({
            "9535b946-f30c-4a43-b852-000000slayer": expect.objectContaining({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: expect.any(String) as string,
              duration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
              endTime: expect.any(String) as string,
            }) as LiveTrackerState["discoveredMatches"][string],
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.objectContaining({
              matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
              gameTypeAndMap: expect.any(String) as string,
              duration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
              endTime: expect.any(String) as string,
            }) as LiveTrackerState["discoveredMatches"][string],
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
      expect(storageSetAlarmSpy).toHaveBeenCalledWith(expect.any(Number));
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
      storageGetSpy.mockResolvedValue(trackerState);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockRejectedValue(new Error("Network error"));
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: "Error: Network error",
          }) as LiveTrackerState["errorState"],
        }),
      );
      expect(storageSetAlarmSpy).toHaveBeenCalled();
      expect(storageDeleteAllSpy).not.toHaveBeenCalled();
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
      storageGetSpy.mockResolvedValue(trackerState);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockRejectedValue(new Error("Persistent error"));

      await liveTrackerDO.alarm();

      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
      expect(storageDeleteAllSpy).toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
    });

    it("handles Discord channel not found error and stops tracker", async () => {
      const trackerState = createAlarmTestTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

      const discordError = new DiscordError(404, { code: 10003, message: "Unknown channel" });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);
      vi.spyOn(services.discordService, "createMessage").mockRejectedValue(discordError);

      await liveTrackerDO.alarm();

      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
      expect(storageDeleteAllSpy).toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
    });

    it("handles Discord update error and continues", async () => {
      const trackerState = createAlarmTestTrackerState();
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      const discordError = new DiscordError(500, { code: 0, message: "Internal server error" });
      vi.spyOn(services.discordService, "editMessage").mockRejectedValue(discordError);

      await liveTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: expect.stringContaining("Discord update failed") as string,
          }) as LiveTrackerState["errorState"],
        }),
      );
      expect(storageSetAlarmSpy).toHaveBeenCalled();
      expect(storageDeleteAllSpy).not.toHaveBeenCalled();
    });

    it("creates new message when no live message exists", async () => {
      const trackerState = createAlarmTestTrackerState({
        liveMessageId: undefined,
      });
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");
      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);

      const guildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTrackingChannelName: "N",
      });
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(guildConfig);

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Live Tracker") as string,
            }),
          ]) as unknown[],
        }),
      );
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          liveMessageId: apiMessage.id,
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: expect.objectContaining({
            matchCount: 0,
            substitutionCount: 0,
          }) as LiveTrackerState["lastMessageState"],
        }),
      );
      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("persists discovered matches when handling substitutions", async () => {
      const eightPlayerSetup = createEightPlayerSetup();
      const existingState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
        discoveredMatches: {
          "existing-match-id": aMatchSummaryWith({
            matchId: "existing-match-id",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            duration: "7m 30s",
            gameScore: "50:47",
            endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
          }),
        },
        rawMatches: {
          "existing-match-id": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      storageGetSpy.mockResolvedValue(existingState);

      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      await liveTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith(
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
          "pre-sub-match": aMatchSummaryWith({
            matchId: "pre-sub-match",
            gameTypeAndMap: "CTF: Catalyst",
            gameType: "CTF",
            gameMap: "Catalyst",
            duration: "8m 45s",
            gameScore: "3:2",
            endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
          }),
        },
        rawMatches: {
          "pre-sub-match": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      storageGetSpy.mockResolvedValue(existingState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      await liveTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith(
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
      storageGetSpy.mockRejectedValue(new Error("Storage error"));
      const errorSpy = vi.spyOn(services.logService, "error").mockImplementation(() => undefined);

      await liveTrackerDO.alarm();

      expect(errorSpy).toHaveBeenCalledWith("LiveTracker alarm error:", expect.any(Map));
    });

    it("creates new message when new matches are detected", async () => {
      const eightPlayerSetup = createEightPlayerSetup();
      const trackerState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        discoveredMatches: {},
        rawMatches: {},
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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

      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
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
      storageGetSpy.mockResolvedValue(trackerState);

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

      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
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
          "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            duration: "5m 00s",
            gameScore: "50:49",
            endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
          }),
        },
        rawMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
            matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
          ),
        },
      });
      storageGetSpy.mockResolvedValue(trackerState);

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

      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
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
      const eightPlayerSetup = createEightPlayerSetup();
      const trackerState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        discoveredMatches: {},
        rawMatches: {},
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
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
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          liveMessageId: "new-message-id",
        }),
      );
    });

    it("updates lastMessageState correctly when both matches and substitutions are added", async () => {
      const eightPlayerSetup = createEightPlayerSetup();
      const trackerState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
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
          "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
            matchId: "9535b946-f30c-4a43-b852-000000slayer",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            duration: "5m 00s",
            gameScore: "50:49",
            endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
          }),
        },
        rawMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
            matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
          ),
        },
      });
      storageGetSpy.mockResolvedValue(trackerState);

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
      vi.spyOn(services.haloService, "getMatchScore")
        .mockReturnValueOnce({ gameScore: "50:49", gameSubScore: null })
        .mockReturnValueOnce({ gameScore: "3:2", gameSubScore: null });

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
      expect(storagePutSpy).toHaveBeenCalledTimes(1);
      expect(storagePutSpy).toHaveBeenCalledWith(
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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

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
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

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
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });
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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

        const getChannelSpy = vi.spyOn(services.discordService, "getChannel");
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");

        const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
        vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
        vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
        vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
        vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

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
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

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
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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
            "9535b946-f30c-4a43-b852-000000slayer": aMatchSummaryWith({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              duration: "5m 00s",
              gameScore: "50:49",
              endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
            }),
          },
          rawMatches: {
            "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
              matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
            ),
          },
        });
        storageGetSpy.mockResolvedValue(trackerState);

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
        vi.spyOn(services.haloService, "getMatchScore").mockReturnValue({ gameScore: "50:49", gameSubScore: null });

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
        storageGetSpy.mockResolvedValue(trackerState);

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
        storageGetSpy.mockResolvedValue(trackerState);

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
        storageGetSpy.mockResolvedValue(trackerState);

        const getChannelSpy = vi.spyOn(services.discordService, "getChannel");
        const updateChannelSpy = vi.spyOn(services.discordService, "updateChannel");

        const response = await liveTrackerDO.fetch(new Request("https://example.com/stop"));

        expect(response.status).toBe(200);
        expect(getChannelSpy).not.toHaveBeenCalled();
        expect(updateChannelSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("handleSubstitution()", () => {
    const createSubstitutionRequest = (playerOutId: string, playerInId: string): Request => {
      return new Request("http://do/substitution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerOutId, playerInId }),
      });
    };

    const createTrackerStateWithPlayer = (playerId: string): LiveTrackerState => {
      return createAlarmTestTrackerState({
        players: {
          [playerId]: createTestPlayer(playerId, "existingplayer", "0001", "Existing Player"),
          player2: createTestPlayer("player2", "player2", "0002", "Player Two"),
        },
        teams: [
          {
            name: "Team Alpha",
            playerIds: [playerId],
          },
          {
            name: "Team Beta",
            playerIds: ["player2"],
          },
        ],
      });
    };

    it("processes valid substitution request", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      const originalSearchStartTime = trackerState.searchStartTime;
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        substitution: {
          playerOutId: "player1",
          playerInId: "newplayer",
          teamIndex: 0,
        },
      });

      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          teams: [
            {
              name: "Team Alpha",
              playerIds: ["newplayer"],
            },
            {
              name: "Team Beta",
              playerIds: ["player2"],
            },
          ],
          players: expect.objectContaining({
            newplayer: newPlayer,
          }) as Record<string, unknown>,
          substitutions: [
            {
              playerOutId: "player1",
              playerInId: "newplayer",
              teamIndex: 0,
              teamName: "Team Alpha",
              timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) as string,
            },
          ],
          searchStartTime: expect.not.stringMatching(originalSearchStartTime) as string,
        }),
      );
    });

    it("resets searchStartTime to current time on substitution", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      const pastTime = new Date(Date.now() - 300000).toISOString(); // 5 minutes ago
      trackerState.searchStartTime = pastTime;
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const beforeSubstitution = Date.now();
      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));
      const afterSubstitution = Date.now();

      expect(storagePutSpy).toHaveBeenCalledWith("trackerState", expect.any(Object));
      expect(storagePutSpy).toHaveBeenCalledTimes(1);

      // Verify searchStartTime was reset to a recent time
      const callArg = storagePutSpy.mock.lastCall;
      expect(callArg).toBeDefined();
      if (callArg) {
        const [, state] = callArg;
        const savedSearchStartTime = new Date(state.searchStartTime).getTime();
        expect(savedSearchStartTime).toBeGreaterThanOrEqual(beforeSubstitution);
        expect(savedSearchStartTime).toBeLessThanOrEqual(afterSubstitution);
        expect(state.searchStartTime).not.toBe(pastTime);
      }
    });

    it("correctly updates team playerIds array during substitution", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      const savedState = Preconditions.checkExists(storagePutSpy.mock.calls[0]?.[1]);
      expect(savedState.teams[0]?.playerIds).toEqual(["newplayer"]);
      expect(savedState.teams[1]?.playerIds).toEqual(["player2"]);
    });

    it("adds new player to players Record during substitution", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      const savedState = Preconditions.checkExists(storagePutSpy.mock.calls[0]?.[1]);
      expect(savedState.players).toHaveProperty("newplayer", newPlayer);
      expect(savedState.players).toHaveProperty("player2");
      expect(savedState.players).toHaveProperty("player1"); // Old player data is preserved
    });

    it("records substitution with correct metadata", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const beforeSubstitution = Date.now();
      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));
      const afterSubstitution = Date.now();

      const savedState = Preconditions.checkExists(storagePutSpy.mock.calls[0]?.[1]);
      expect(savedState.substitutions).toHaveLength(1);
      expect(savedState.substitutions[0]).toEqual({
        playerOutId: "player1",
        playerInId: "newplayer",
        teamIndex: 0,
        teamName: "Team Alpha",
        timestamp: expect.any(String) as string,
      });

      const substitutionTime = new Date(savedState.substitutions[0]?.timestamp ?? "").getTime();
      expect(substitutionTime).toBeGreaterThanOrEqual(beforeSubstitution);
      expect(substitutionTime).toBeLessThanOrEqual(afterSubstitution);
    });

    it("syncs match data before processing substitution", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      const getSeriesSpy = vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(getSeriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          startDateTime: expect.any(Date) as Date,
          endDateTime: expect.any(Date) as Date,
          teams: expect.any(Array) as { name: string; playerIds: string[] }[],
        }),
        true,
      );
    });

    it("rejects substitution when tracker is stopped", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      trackerState.status = "stopped";
      storageGetSpy.mockResolvedValue(trackerState);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("Cannot process substitution for stopped tracker");
    });

    it("returns 404 when no tracker exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns 400 when player not found in teams", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("nonexistent", "newplayer"));

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("Player not found in teams");
    });

    it("returns 400 when new player not found in Discord", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe("New player not found");
    });

    it("handles Discord API errors during player lookup gracefully", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.discordService, "getUsers").mockRejectedValue(new Error("Discord API error"));
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      const response = await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Internal Server Error");
    });

    it("handles multiple substitutions for same team", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer1 = createTestPlayer("newplayer1", "newplayer1", "0003", "New Player 1");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer1]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer1"));

      const updatedState = Preconditions.checkExists(storagePutSpy.mock.calls[0]?.[1]);
      storageGetSpy.mockResolvedValue(updatedState);

      const newPlayer2 = createTestPlayer("newplayer2", "newplayer2", "0004", "New Player 2");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer2]);

      await liveTrackerDO.fetch(createSubstitutionRequest("newplayer1", "newplayer2"));

      const finalState = Preconditions.checkExists(storagePutSpy.mock.calls[1]?.[1]);
      expect(finalState.teams[0]?.playerIds).toEqual(["newplayer2"]);
      expect(finalState.substitutions).toHaveLength(2);
      expect(finalState.substitutions[0]?.playerOutId).toBe("player1");
      expect(finalState.substitutions[0]?.playerInId).toBe("newplayer1");
      expect(finalState.substitutions[1]?.playerOutId).toBe("newplayer1");
      expect(finalState.substitutions[1]?.playerInId).toBe("newplayer2");
    });

    it("maintains team structure integrity after substitution", async () => {
      const trackerState = createTrackerStateWithPlayer("player1");
      storageGetSpy.mockResolvedValue(trackerState);

      const newPlayer = createTestPlayer("newplayer", "newplayer", "0003", "New Player");
      vi.spyOn(services.discordService, "getUsers").mockResolvedValue([newPlayer]);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);

      await liveTrackerDO.fetch(createSubstitutionRequest("player1", "newplayer"));

      const savedState = Preconditions.checkExists(storagePutSpy.mock.calls[0]?.[1]);
      expect(savedState.teams).toHaveLength(2);
      expect(savedState.teams[0]?.name).toBe("Team Alpha");
      expect(savedState.teams[0]?.playerIds).toHaveLength(1);
      expect(savedState.teams[1]?.name).toBe("Team Beta");
      expect(savedState.teams[1]?.playerIds).toHaveLength(1);
    });
  });

  describe("substitution + alarm integration", () => {
    it("processes matches correctly after substitution occurs", async () => {
      const eightPlayerSetup = createEightPlayerSetup();
      const trackerState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
        substitutions: [
          {
            playerOutId: "oldplayer",
            playerInId: "user1",
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: new Date(Date.now() - 60000).toISOString(),
          },
        ],
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      await liveTrackerDO.alarm();

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          substitutions: expect.arrayContaining([
            expect.objectContaining({
              playerOutId: "oldplayer",
              playerInId: "user1",
            }),
          ]),
          discoveredMatches: expect.objectContaining({
            "9535b946-f30c-4a43-b852-000000slayer": expect.any(Object),
          }),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it("maintains match history when substitution happens between alarms", async () => {
      const existingMatches = {
        "pre-sub-match": aMatchSummaryWith({
          matchId: "pre-sub-match",
          gameTypeAndMap: "CTF: Catalyst",
          gameType: "CTF",
          gameMap: "Catalyst",
          duration: "8m 45s",
          gameScore: "3:2",
          endTime: new Date("2024-01-01T10:00:00.000Z").toISOString(),
        }),
      };

      const eightPlayerSetup = createEightPlayerSetup();
      const trackerState = createAlarmTestTrackerState({
        // Update to match the mock data (2 teams, 8 players)
        ...eightPlayerSetup,
        discoveredMatches: existingMatches,
        rawMatches: {
          "pre-sub-match": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
        substitutions: [
          {
            playerOutId: "oldplayer",
            playerInId: "newplayer",
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: new Date().toISOString(),
          },
        ],
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const newMatches = [Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(newMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");

      await liveTrackerDO.alarm();

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          discoveredMatches: expect.objectContaining({
            "pre-sub-match": expect.any(Object),
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.any(Object),
          }),
          substitutions: expect.arrayContaining([
            expect.objectContaining({
              playerOutId: "oldplayer",
              playerInId: "newplayer",
            }),
          ]),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it("updates message when substitution count changes", async () => {
      const trackerState = createAlarmTestTrackerState({
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
        substitutions: [
          {
            playerOutId: "oldplayer",
            playerInId: "newplayer",
            teamIndex: 0,
            teamName: "Team Alpha",
            timestamp: new Date().toISOString(),
          },
        ],
      });
      storageGetSpy.mockResolvedValue(trackerState);

      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

      await liveTrackerDO.alarm();

      expect(createMessageSpy).toHaveBeenCalled();
      expect(deleteMessageSpy).toHaveBeenCalled();
      expect(storagePutSpy).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 1,
          },
        }),
      );
    });

    it("uses current team playerIds for filtering after substitution", async () => {
      const trackerState = createAlarmTestTrackerState({
        players: {
          originalPlayer: createTestPlayer("originalPlayer", "original", "0001", "Original Player"),
          newPlayer: createTestPlayer("newPlayer", "new", "0002", "New Player"),
          unchangedPlayer: createTestPlayer("unchangedPlayer", "unchanged", "0003", "Unchanged Player"),
        },
        teams: [
          {
            name: "Team Alpha",
            playerIds: ["newPlayer"],
          },
          {
            name: "Team Beta",
            playerIds: ["unchangedPlayer"],
          },
        ],
        substitutions: [
          {
            playerOutId: "originalPlayer",
            playerInId: "newPlayer",
            teamIndex: 0,
            teamName: "Team Alpha",
            timestamp: new Date().toISOString(),
          },
        ],
      });
      storageGetSpy.mockResolvedValue(trackerState);

      const getSeriesFromDiscordQueueSpy = vi
        .spyOn(services.haloService, "getSeriesFromDiscordQueue")
        .mockResolvedValue([]);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      expect(getSeriesFromDiscordQueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          teams: [
            [
              expect.objectContaining({
                id: "newPlayer",
                username: "new",
                globalName: "New Player",
                guildNickname: null,
              }),
            ],
            [
              expect.objectContaining({
                id: "unchangedPlayer",
                username: "unchanged",
                globalName: "Unchanged Player",
                guildNickname: null,
              }),
            ],
          ],
        }),
        true,
      );
    });
  });
});
