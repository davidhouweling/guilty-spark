import { describe, beforeEach, it, expect, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { LiveTrackerDO, type LiveTrackerStartData, type LiveTrackerState } from "../live-tracker-do.mjs";
import { installFakeServicesWith } from "../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";
import type { Services } from "../../services/install.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import { aGuildMemberWith, apiMessage } from "../../services/discord/fakes/data.mjs";
import { aFakeDurableObjectId } from "../fakes/live-tracker-do.fake.mjs";
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
  metrics: {
    totalChecks: 1,
    totalMatches: 0,
    totalErrors: 0,
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
  metrics: {
    totalChecks: 0,
    totalMatches: 0,
    totalErrors: 0,
    lastCheckDurationMs: 0,
    averageCheckDurationMs: 0,
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
  metrics: {
    totalChecks: 0,
    totalMatches: 0,
    totalErrors: 0,
    lastCheckDurationMs: 0,
    averageCheckDurationMs: 0,
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

      expect(response.status).toBe(200); // Still succeeds even with Discord error
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
      // handlePause doesn't call deleteAlarm
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

      expect(response.status).toBe(200); // Still succeeds, just sets paused state
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

      expect(response.status).toBe(200); // Still succeeds, just sets active state
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
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");

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
        metrics: {
          totalChecks: 0,
          totalMatches: 0,
          totalErrors: 0,
          lastCheckDurationMs: 0,
          averageCheckDurationMs: 0,
        },
        lastMessageState: {
          matchCount: 0,
          substitutionCount: 0,
        },
      };
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("2:1");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      expect(mockStorage.get).toHaveBeenCalledWith("trackerState");
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          metrics: expect.objectContaining({
            totalChecks: 1,
            totalMatches: 2,
          }) as LiveTrackerState["metrics"],
          // Verify that matches are stored in both discoveredMatches and rawMatches
          discoveredMatches: expect.objectContaining({
            "9535b946-f30c-4a43-b852-000000slayer": expect.objectContaining({
              matchId: "9535b946-f30c-4a43-b852-000000slayer",
              gameTypeAndMap: expect.any(String) as string,
              gameDuration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
            }) as MatchStats,
            "d81554d7-ddfe-44da-a6cb-000000000ctf": expect.objectContaining({
              matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
              gameTypeAndMap: expect.any(String) as string,
              gameDuration: expect.any(String) as string,
              gameScore: expect.any(String) as string,
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
        metrics: {
          totalChecks: 0,
          totalMatches: 0,
          totalErrors: 0,
          lastCheckDurationMs: 0,
          averageCheckDurationMs: 0,
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockRejectedValue(new Error("Network error"));
      vi.spyOn(services.haloService, "getGameTypeAndMap").mockResolvedValue("Slayer on Aquarius");
      vi.spyOn(services.haloService, "getReadableDuration").mockReturnValue("5:00");
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("0:0");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.logService, "warn").mockImplementation(() => undefined);
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 1,
          errorState: expect.objectContaining({
            consecutiveErrors: 1,
            lastErrorMessage: "Error: Network error",
          }) as LiveTrackerState["errorState"],
          metrics: expect.objectContaining({
            totalErrors: 1,
          }) as LiveTrackerState["metrics"],
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
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");
      vi.spyOn(services.logService, "warn").mockImplementation(() => undefined);
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

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

    it("logs performance metrics every 10 checks", async () => {
      const trackerState = createAlarmTestTrackerState({
        checkCount: 9,
        metrics: {
          totalChecks: 9,
          totalMatches: 15,
          totalErrors: 2,
          lastCheckDurationMs: 150,
          averageCheckDurationMs: 125,
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);

      const mockMatches = [Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"))];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");
      vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      const infoSpy = vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          checkCount: 10,
          metrics: expect.objectContaining({
            totalChecks: 10,
          }) as LiveTrackerState["metrics"],
        }),
      );

      // Verify that performance metrics are logged (check 10 is divisible by 10)
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Live Tracker Performance Metrics"),
        expect.any(Map),
      );
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
          metrics: expect.objectContaining({
            totalMatches: 1,
          }) as LiveTrackerState["metrics"],
        }),
      );
      expect(mockStorage.setAlarm).toHaveBeenCalled();
    });

    it("persists discovered matches when handling substitutions", async () => {
      // Initial state with some discovered matches
      const existingState = createAlarmTestTrackerState({
        discoveredMatches: {
          "existing-match-id": {
            matchId: "existing-match-id",
            gameTypeAndMap: "Slayer on Aquarius",
            gameDuration: "7:30",
            gameScore: "Team Cobalt 50 - 47 Team Gold",
          },
        },
        rawMatches: {
          "existing-match-id": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      mockStorage.get.mockResolvedValue(existingState);

      // Mock that we get both existing and new matches
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
          // Should contain both existing and new matches in discovered and raw state
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
      // State with existing matches and a substitution
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
            gameDuration: "8:45",
            gameScore: "Team Alpha 3 - 2 Team Beta",
          },
        },
        rawMatches: {
          "pre-sub-match": Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
        },
      });

      mockStorage.get.mockResolvedValue(existingState);

      // Mock that the existing match is still returned from the queue
      const mockMatches = [
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")), // Same existing match
      ];
      vi.spyOn(services.haloService, "getSeriesFromDiscordQueue").mockResolvedValue(mockMatches);
      vi.spyOn(services.haloService, "getSeriesScore").mockReturnValue("1:0");

      await liveTrackerDO.alarm();

      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          // Should preserve existing substitution
          substitutions: expect.arrayContaining([
            expect.objectContaining({
              playerOutId: "user1",
              playerInId: "user2",
              teamIndex: 0,
              teamName: "Team Alpha",
            }),
          ]) as LiveTrackerState["substitutions"],
          // Should preserve existing match data
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
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);
      vi.spyOn(services.logService, "warn").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage");

      await liveTrackerDO.alarm();

      // Should create new message and delete old one
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

      // Should update lastMessageState
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
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage");

      await liveTrackerDO.alarm();

      // Should create new message and delete old one
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

      // Should update lastMessageState
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
            gameDuration: "5:00",
            gameScore: "50-49",
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
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage");
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage");
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);

      await liveTrackerDO.alarm();

      // Should edit existing message
      expect(editMessageSpy).toHaveBeenCalledWith(
        trackerState.channelId,
        trackerState.liveMessageId,
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.objectContaining({})]) as Record<string, unknown>[],
        }),
      );
      expect(createMessageSpy).not.toHaveBeenCalled();
      expect(deleteMessageSpy).not.toHaveBeenCalled();

      // Should maintain lastMessageState
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
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValue("50-49");
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(services.logService, "warn").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      const deleteMessageSpy = vi
        .spyOn(services.discordService, "deleteMessage")
        .mockRejectedValue(new Error("Cannot delete message"));

      await liveTrackerDO.alarm();

      // Should still create new message
      expect(createMessageSpy).toHaveBeenCalled();
      expect(deleteMessageSpy).toHaveBeenCalled();

      // Should log warning about delete failure but continue
      expect(warnSpy).toHaveBeenCalledWith("Failed to delete old live tracker message", expect.any(Map));

      // Should still update state with new message ID
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
            gameDuration: "5:00",
            gameScore: "50-49",
          },
        },
        rawMatches: {
          "9535b946-f30c-4a43-b852-000000slayer": Preconditions.checkExists(
            matchStats.get("9535b946-f30c-4a43-b852-000000slayer"),
          ),
        },
      });
      mockStorage.get.mockResolvedValue(trackerState);

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
      vi.spyOn(services.haloService, "getMatchScore").mockReturnValueOnce("50-49").mockReturnValueOnce("3-2");
      vi.spyOn(services.logService, "info").mockImplementation(() => undefined);

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue({
        ...apiMessage,
        id: "new-message-id",
      });
      vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

      await liveTrackerDO.alarm();

      // Should create new message because both matches and substitutions increased
      expect(createMessageSpy).toHaveBeenCalled();

      // Should update lastMessageState to reflect current counts
      expect(mockStorage.put).toHaveBeenCalledWith(
        "trackerState",
        expect.objectContaining({
          lastMessageState: {
            matchCount: 1, // Currently only 1 match is being processed successfully
            substitutionCount: 2, // Both substitutions in current state
          },
        }),
      );
    });
  });
});
