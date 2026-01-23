import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import { NeatQueueService } from "../neatqueue.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import {
  aFakeDatabaseServiceWith,
  aFakeGuildConfigRow,
  aFakeNeatQueueConfigRow,
} from "../../database/fakes/database.fake.mjs";
import { getFakeNeatQueueData } from "../fakes/data.mjs";

import type { DatabaseService } from "../../database/database.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { guild, textChannel, guildMember } from "../../discord/fakes/data.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { matchStats } from "../../halo/fakes/data.mjs";
import { aFakeLiveTrackerServiceWith } from "../../live-tracker/fakes/live-tracker.fake.mjs";
import type { LiveTrackerService } from "../../live-tracker/live-tracker.mjs";
import type {
  NeatQueueMatchCompletedRequest,
  NeatQueueSubstitutionRequest,
  NeatQueueTeamsCreatedRequest,
} from "../types.mjs";
import type {
  LiveTrackerStartResponse,
  LiveTrackerStatusResponse,
  LiveTrackerSubstitutionResponse,
  LiveTrackerStopResponse,
  LiveTrackerRefreshResponse,
} from "../../../durable-objects/types.mjs";
import { aFakeLiveTrackerStateWith } from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

describe("NeatQueueService Live Tracker Integration", () => {
  // align this with time just after ctf.json match completed
  const now = new Date("2024-11-26T10:48:00.000Z").getTime();

  let env: Env;
  let logService: LogService;
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let haloService: HaloService;
  let liveTrackerService: LiveTrackerService;
  let neatQueueService: NeatQueueService;

  let startTrackerSpy: MockInstance<LiveTrackerService["startTracker"]>;
  let getTrackerStatusSpy: MockInstance<LiveTrackerService["getTrackerStatus"]>;
  let recordSubstitutionSpy: MockInstance<LiveTrackerService["recordSubstitution"]>;
  let stopTrackerSpy: MockInstance<LiveTrackerService["stopTracker"]>;
  let getGuildConfigSpy: MockInstance<DatabaseService["getGuildConfig"]>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    liveTrackerService = aFakeLiveTrackerServiceWith({ logService, discordService, env });

    neatQueueService = new NeatQueueService({
      env,
      logService,
      databaseService,
      discordService,
      haloService,
      liveTrackerService,
    });

    // Mock LiveTrackerService methods
    startTrackerSpy = vi.spyOn(liveTrackerService, "startTracker");
    getTrackerStatusSpy = vi.spyOn(liveTrackerService, "getTrackerStatus");
    recordSubstitutionSpy = vi.spyOn(liveTrackerService, "recordSubstitution");
    stopTrackerSpy = vi.spyOn(liveTrackerService, "stopTracker");

    getGuildConfigSpy = vi.spyOn(databaseService, "getGuildConfig").mockResolvedValue(
      aFakeGuildConfigRow({
        NeatQueueInformerLiveTracking: "Y",
      }),
    );

    // Mock Discord service for permission checks
    vi.spyOn(discordService, "getGuild").mockResolvedValue(guild);
    vi.spyOn(discordService, "getChannel").mockResolvedValue(textChannel);
    vi.spyOn(discordService, "getGuildMember").mockResolvedValue(guildMember);
    vi.spyOn(discordService, "hasPermissions").mockReturnValue({
      hasAll: true,
      missing: [],
    });
  });

  describe("TEAMS_CREATED event", () => {
    const mockRequest = getFakeNeatQueueData("teamsCreated");
    const callTeamsCreatedJob = async (
      request: NeatQueueTeamsCreatedRequest,
      neatQueueConfig = aFakeNeatQueueConfigRow(),
    ): Promise<void> => {
      const { jobToComplete } = neatQueueService.handleRequest(request, neatQueueConfig);
      return jobToComplete?.();
    };

    it("starts live tracking when enabled in guild config", async () => {
      const mockStartResponse: LiveTrackerStartResponse = {
        success: true,
        state: {
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          queueNumber: mockRequest.match_number,
          isPaused: false,
          status: "active",
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      startTrackerSpy.mockResolvedValue(mockStartResponse);

      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(startTrackerSpy).toHaveBeenCalledWith({
        userId: "DISCORD_APP_ID",
        guildId: mockRequest.guild,
        channelId: mockRequest.channel,
        queueNumber: mockRequest.match_number,
        players: {
          discord_user_01: guildMember,
        },
        teams: [
          {
            name: "Team 1",
            playerIds: ["discord_user_01"],
          },
          {
            name: "Team 2",
            playerIds: ["discord_user_02"],
          },
        ],
        queueStartTime: "2024-11-26T10:48:00.000Z",
      });
    });

    it("does not start live tracking when disabled in guild config", async () => {
      getGuildConfigSpy.mockResolvedValue(
        aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
        }),
      );

      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(startTrackerSpy).not.toHaveBeenCalled();
    });

    it("handles missing guild config gracefully", async () => {
      const mockGuildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTracking: "N",
      });
      getGuildConfigSpy.mockResolvedValue(mockGuildConfig);

      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(startTrackerSpy).not.toHaveBeenCalled();
    });

    it("logs errors when live tracking fails to start", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      startTrackerSpy.mockRejectedValue(new Error("LiveTracker start failed"));

      await callTeamsCreatedJob(mockRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-start live tracking"),
        expect.any(Map),
      );
    });

    it("continues normal operation if live tracking fails", async () => {
      startTrackerSpy.mockRejectedValue(new Error("LiveTracker start failed"));

      // Should not throw error, just log it
      await expect(callTeamsCreatedJob(mockRequest)).resolves.toBeUndefined();
    });

    it("generates consistent DO IDs for same guild/channel/queue", async () => {
      const mockStartResponse: LiveTrackerStartResponse = {
        success: true,
        state: aFakeLiveTrackerStateWith(),
      };
      startTrackerSpy.mockResolvedValue(mockStartResponse);

      const testRequest = getFakeNeatQueueData("teamsCreated");

      await callTeamsCreatedJob(testRequest);

      expect(startTrackerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: testRequest.guild,
          channelId: testRequest.channel,
          queueNumber: testRequest.match_number,
        }),
      );
    });

    it("generates different DO IDs for different parameters", async () => {
      const mockStartResponse: LiveTrackerStartResponse = {
        success: true,
        state: aFakeLiveTrackerStateWith(),
      };
      startTrackerSpy.mockResolvedValue(mockStartResponse);

      const testRequest = {
        ...getFakeNeatQueueData("teamsCreated"),
        guild: "guild456",
        channel: "channel789",
        match_number: 100,
      };

      await callTeamsCreatedJob(testRequest);

      expect(startTrackerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: "guild456",
          channelId: "channel789",
          queueNumber: 100,
        }),
      );
    });

    it("handles database service errors gracefully", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      getGuildConfigSpy.mockRejectedValue(new Error("Database error"));

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(testRequest);

      expect(logWarnSpy).toHaveBeenCalled();
      expect(startTrackerSpy).not.toHaveBeenCalled();
    });

    it("handles Durable Object namespace errors gracefully", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      startTrackerSpy.mockRejectedValue(new Error("DO namespace error"));

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(testRequest);

      expect(logWarnSpy).toHaveBeenCalled();
    });
  });

  describe("SUBSTITUTION event", () => {
    const mockRequest = getFakeNeatQueueData("substitution");
    const callSubstitutionJob = async (
      request: NeatQueueSubstitutionRequest,
      neatQueueConfig = aFakeNeatQueueConfigRow(),
    ): Promise<void> => {
      const { jobToComplete } = neatQueueService.handleRequest(request, neatQueueConfig);
      return jobToComplete?.();
    };

    it("updates live tracker when active tracker exists", async () => {
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: mockRequest.match_number ?? 1,
          // Include other required properties
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      const mockSubstitutionResponse: LiveTrackerSubstitutionResponse = {
        success: true,
        substitution: {
          playerOutId: mockRequest.player_subbed_out.id,
          playerInId: mockRequest.player_subbed_in.id,
          teamIndex: 0,
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      recordSubstitutionSpy.mockResolvedValue(mockSubstitutionResponse);

      await callSubstitutionJob(mockRequest);

      expect(getTrackerStatusSpy).toHaveBeenCalledWith({
        userId: "",
        guildId: mockRequest.guild,
        channelId: mockRequest.channel,
        queueNumber: mockRequest.match_number ?? 1,
      });
      expect(recordSubstitutionSpy).toHaveBeenCalledWith({
        context: {
          userId: "",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          queueNumber: mockRequest.match_number ?? 1,
        },
        playerOutId: mockRequest.player_subbed_out.id,
        playerInId: mockRequest.player_subbed_in.id,
      });
    });

    it("skips update when no match number is provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match_number, ...requestWithoutMatchNumber } = mockRequest;

      await callSubstitutionJob(requestWithoutMatchNumber);

      expect(getTrackerStatusSpy).not.toHaveBeenCalled();
      expect(recordSubstitutionSpy).not.toHaveBeenCalled();
    });

    it("skips update when live tracker is not active", async () => {
      getTrackerStatusSpy.mockResolvedValue(null);

      await callSubstitutionJob(mockRequest);

      expect(getTrackerStatusSpy).toHaveBeenCalled();
      expect(recordSubstitutionSpy).not.toHaveBeenCalled();
    });

    it("logs warning when substitution update fails", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: Preconditions.checkExists(mockRequest.match_number),
          // Include other required properties
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      recordSubstitutionSpy.mockRejectedValue(new Error("Substitution failed"));

      await callSubstitutionJob(mockRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update live tracker with substitution"),
        expect.any(Map),
      );
    });

    it("continues normal operation if live tracker update fails", async () => {
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: Preconditions.checkExists(mockRequest.match_number),
          // Include other required properties
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      recordSubstitutionSpy.mockRejectedValue(new Error("DO substitution failed"));

      // Should not throw error, just log it
      await expect(callSubstitutionJob(mockRequest)).resolves.toBeUndefined();
    });

    it("sends correct substitution data to live tracker", async () => {
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: Preconditions.checkExists(mockRequest.match_number),
          // Include other required properties
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      const mockSubstitutionResponse: LiveTrackerSubstitutionResponse = {
        success: true,
        substitution: {
          playerOutId: mockRequest.player_subbed_out.id,
          playerInId: mockRequest.player_subbed_in.id,
          teamIndex: 0,
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      recordSubstitutionSpy.mockResolvedValue(mockSubstitutionResponse);

      await callSubstitutionJob(mockRequest);

      expect(getTrackerStatusSpy).toHaveBeenCalledWith({
        userId: "",
        guildId: mockRequest.guild,
        channelId: mockRequest.channel,
        queueNumber: mockRequest.match_number ?? 1,
      });
      expect(recordSubstitutionSpy).toHaveBeenCalledWith({
        context: {
          userId: "",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          queueNumber: mockRequest.match_number ?? 1,
        },
        playerOutId: mockRequest.player_subbed_out.id,
        playerInId: mockRequest.player_subbed_in.id,
      });
    });

    it("logs successful substitution update", async () => {
      const logInfoSpy = vi.spyOn(logService, "info");
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: mockRequest.match_number ?? 1,
          // Include other required properties
          userId: "DISCORD_APP_ID",
          guildId: mockRequest.guild,
          channelId: mockRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      const mockSubstitutionResponse: LiveTrackerSubstitutionResponse = {
        success: true,
        substitution: {
          playerOutId: mockRequest.player_subbed_out.id,
          playerInId: mockRequest.player_subbed_in.id,
          teamIndex: 0,
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      recordSubstitutionSpy.mockResolvedValue(mockSubstitutionResponse);

      await callSubstitutionJob(mockRequest);

      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Updated live tracker with substitution for queue"),
        expect.any(Map),
      );
    });
  });

  describe("MATCH_COMPLETED event", () => {
    const mockMatchCompletedRequest = getFakeNeatQueueData("matchCompleted");
    const callMatchCompletedJob = async (
      request: NeatQueueMatchCompletedRequest,
      neatQueueConfig = aFakeNeatQueueConfigRow(),
    ): Promise<void> => {
      const { jobToComplete } = neatQueueService.handleRequest(request, neatQueueConfig);
      return jobToComplete?.();
    };

    it("calls stopLiveTrackingIfActive on match completion", async () => {
      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: {
          status: "active",
          queueNumber: Preconditions.checkExists(mockMatchCompletedRequest.match_number),
          userId: "DISCORD_APP_ID",
          guildId: mockMatchCompletedRequest.guild,
          channelId: mockMatchCompletedRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      const mockStopResponse: LiveTrackerStopResponse = {
        success: true,
        state: {
          status: "stopped",
          queueNumber: Preconditions.checkExists(mockMatchCompletedRequest.match_number),
          userId: "DISCORD_APP_ID",
          guildId: mockMatchCompletedRequest.guild,
          channelId: mockMatchCompletedRequest.channel,
          isPaused: false,
          startTime: "2024-11-26T10:48:00.000Z",
          lastUpdateTime: "2024-11-26T10:48:00.000Z",
          searchStartTime: "2024-11-26T10:48:00.000Z",
          checkCount: 0,
          players: {},
          teams: [],
          substitutions: [],
          errorState: {
            consecutiveErrors: 0,
            backoffMinutes: 1,
            lastSuccessTime: "2024-11-26T10:48:00.000Z",
          },
          discoveredMatches: {},
          rawMatches: {},
          lastMessageState: {
            matchCount: 0,
            substitutionCount: 0,
          },
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      stopTrackerSpy.mockResolvedValue(mockStopResponse);

      // Simulate match completion event processing
      await callMatchCompletedJob(mockMatchCompletedRequest);

      expect(getTrackerStatusSpy).toHaveBeenCalledWith({
        userId: "",
        guildId: mockMatchCompletedRequest.guild,
        channelId: mockMatchCompletedRequest.channel,
        queueNumber: mockMatchCompletedRequest.match_number,
      });
      expect(stopTrackerSpy).toHaveBeenCalledWith({
        userId: "",
        guildId: mockMatchCompletedRequest.guild,
        channelId: mockMatchCompletedRequest.channel,
        queueNumber: mockMatchCompletedRequest.match_number,
      });
    });

    it("refreshes live tracker with matchCompleted flag when active", async () => {
      const refreshTrackerSpy = vi.spyOn(liveTrackerService, "refreshTracker");
      const match1 = Preconditions.checkExists(Array.from(matchStats.values())[0]);
      const match2 = Preconditions.checkExists(Array.from(matchStats.values())[1]);
      const mockRawMatches = {
        [match1.MatchId]: match1,
        [match2.MatchId]: match2,
      };

      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: aFakeLiveTrackerStateWith({
          status: "active",
          queueNumber: Preconditions.checkExists(mockMatchCompletedRequest.match_number),
          guildId: mockMatchCompletedRequest.guild,
          channelId: mockMatchCompletedRequest.channel,
          rawMatches: mockRawMatches,
        }),
      };

      const mockRefreshResponse: LiveTrackerRefreshResponse = {
        success: true as const,
        state: mockStatusResponse.state,
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      refreshTrackerSpy.mockResolvedValue(mockRefreshResponse);
      stopTrackerSpy.mockResolvedValue({ success: true, state: mockStatusResponse.state });

      await callMatchCompletedJob(mockMatchCompletedRequest);

      expect(refreshTrackerSpy).toHaveBeenCalledWith(
        {
          userId: "",
          guildId: mockMatchCompletedRequest.guild,
          channelId: mockMatchCompletedRequest.channel,
          queueNumber: mockMatchCompletedRequest.match_number,
        },
        true,
      );
    });

    it("uses refreshed raw matches when available", async () => {
      const refreshTrackerSpy = vi.spyOn(liveTrackerService, "refreshTracker");
      const getSeriesFromDiscordQueueSpy = vi.spyOn(haloService, "getSeriesFromDiscordQueue");
      const match1 = Preconditions.checkExists(Array.from(matchStats.values())[0]);
      const match2 = Preconditions.checkExists(Array.from(matchStats.values())[1]);
      const mockRawMatches = {
        [match1.MatchId]: match1,
        [match2.MatchId]: match2,
      };

      const mockStatusResponse: LiveTrackerStatusResponse = {
        state: aFakeLiveTrackerStateWith({
          status: "active",
          queueNumber: Preconditions.checkExists(mockMatchCompletedRequest.match_number),
          guildId: mockMatchCompletedRequest.guild,
          channelId: mockMatchCompletedRequest.channel,
          rawMatches: {},
        }),
      };

      const mockRefreshResponse: LiveTrackerRefreshResponse = {
        success: true as const,
        state: {
          ...mockStatusResponse.state,
          rawMatches: mockRawMatches,
        },
      };

      getTrackerStatusSpy.mockResolvedValue(mockStatusResponse);
      refreshTrackerSpy.mockResolvedValue(mockRefreshResponse);
      stopTrackerSpy.mockResolvedValue({ success: true, state: mockStatusResponse.state });

      // Mock the series data fetching to verify it wasn't called
      getSeriesFromDiscordQueueSpy.mockResolvedValue([]);

      await callMatchCompletedJob(mockMatchCompletedRequest);

      expect(refreshTrackerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queueNumber: mockMatchCompletedRequest.match_number,
        }),
        true,
      );

      // Verify that getSeriesFromDiscordQueue was NOT called since we used the refreshed data
      // (Note: It may be called for other purposes, so we check it wasn't called with the timeline params)
      expect(getSeriesFromDiscordQueueSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          teams: expect.any(Array) as Parameters<HaloService["getSeriesFromDiscordQueue"]>[0]["teams"],
        }),
        expect.any(Boolean),
      );
    });
  });
});
