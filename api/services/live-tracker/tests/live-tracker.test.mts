import type { MockInstance, MockedFunction } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGuildMember, APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { GuildMemberFlags } from "discord-api-types/v10";
import { LiveTrackerService, type LiveTrackerContext } from "../live-tracker.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type {
  LiveTrackerStartResponse,
  LiveTrackerPauseResponse,
  LiveTrackerResumeResponse,
  LiveTrackerStopResponse,
  LiveTrackerRefreshResponse,
  LiveTrackerSubstitutionResponse,
  LiveTrackerStatusResponse,
  LiveTrackerRepostResponse,
  LiveTrackerState,
  LiveTrackerRefreshCooldownErrorResponse,
} from "../../../durable-objects/types.mjs";
import type { LiveTrackerDO } from "../../../durable-objects/live-tracker-do.mjs";
import { aFakeDurableObjectId } from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { apiMessage, discordNeatQueueData, fakeButtonClickInteraction } from "../../discord/fakes/data.mjs";
import type { LiveTrackerEmbedData } from "../../../live-tracker/types.mjs";

describe("LiveTrackerService", () => {
  let service: LiveTrackerService;
  let env: Env;
  let logService: LogService;
  let discordService: DiscordService;
  let doStub: DurableObjectStub<LiveTrackerDO>;
  let fetch: MockedFunction<DurableObjectStub<LiveTrackerDO>["fetch"]>;
  let errorSpy: MockInstance<LogService["error"]>;
  let warnSpy: MockInstance<LogService["warn"]>;
  let infoSpy: MockInstance<LogService["info"]>;
  let debugSpy: MockInstance<LogService["debug"]>;

  const liveTrackerContext: LiveTrackerContext = {
    userId: "test-user-id",
    guildId: "test-guild-id",
    channelId: "test-channel-id",
    queueNumber: 42,
  };

  const players: Record<string, APIGuildMember> = {
    player1: {
      user: {
        id: "player1",
        username: "Player1",
        discriminator: "0001",
        global_name: null,
        avatar: null,
      },
      roles: [],
      joined_at: "2024-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: GuildMemberFlags.CompletedOnboarding,
    },
  };

  const teams = [
    { name: "Team 1", playerIds: ["player1"] },
    { name: "Team 2", playerIds: ["player2"] },
  ];

  const state: LiveTrackerState = {
    userId: "test-user-id",
    guildId: "test-guild-id",
    channelId: "test-channel-id",
    queueNumber: 42,
    isPaused: false,
    status: "active",
    startTime: "2024-01-01T00:00:00.000Z",
    lastUpdateTime: "2024-01-01T00:01:00.000Z",
    searchStartTime: "2024-01-01T00:00:00.000Z",
    checkCount: 1,
    players: players,
    teams: teams,
    substitutions: [],
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 1,
      lastSuccessTime: "2024-01-01T00:00:00.000Z",
    },
    discoveredMatches: {},
    rawMatches: {},
    lastMessageState: {
      matchCount: 0,
      substitutionCount: 0,
    },
  };

  const aFakeResponseWith = (response: Partial<Response> = {}): Response => {
    return {
      ok: true,
      clone: function (): Response {
        throw new Error("Function not implemented.");
      },
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      redirected: false,
      url: "",
      webSocket: null,
      cf: undefined,
      type: "default",
      body: null,
      bodyUsed: false,
      /* eslint-disable @typescript-eslint/require-await */
      json: async <T,>(): Promise<T> => {
        throw new Error("Function not implemented.");
      },
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        throw new Error("Function not implemented.");
      },
      bytes: async (): Promise<Uint8Array> => {
        throw new Error("Function not implemented.");
      },
      text: async (): Promise<string> => {
        throw new Error("Function not implemented.");
      },
      formData: async (): Promise<FormData> => {
        throw new Error("Function not implemented.");
      },
      blob: async (): Promise<Blob> => {
        throw new Error("Function not implemented.");
      },
      /* eslint-enable @typescript-eslint/require-await */
      ...response,
    };
  };

  beforeEach(() => {
    fetch = vi.fn();

    doStub = {
      __DURABLE_OBJECT_BRAND: undefined as never,
      fetch: fetch,
      id: aFakeDurableObjectId(),
      connect: vi.fn(),
    };

    const liveTrackerDOId = aFakeDurableObjectId();
    const liveTrackerGet = vi.fn().mockReturnValue(doStub);
    env = aFakeEnvWith({
      LIVE_TRACKER_DO: {
        idFromName: () => liveTrackerDOId,
        idFromString: () => liveTrackerDOId,
        newUniqueId: () => liveTrackerDOId,
        getByName: liveTrackerGet,
        get: liveTrackerGet,
        jurisdiction: () => ({}) as DurableObjectNamespace<LiveTrackerDO>,
      },
    });

    logService = aFakeLogServiceWith();
    errorSpy = vi.spyOn(logService, "error");
    warnSpy = vi.spyOn(logService, "warn");
    infoSpy = vi.spyOn(logService, "info");
    debugSpy = vi.spyOn(logService, "debug");

    discordService = aFakeDiscordServiceWith({});
    service = new LiveTrackerService({
      env: env,
      logService: logService,
      discordService: discordService,
    });
  });

  describe("startTracker", () => {
    it("starts a live tracker successfully", async () => {
      const mockResponse: LiveTrackerStartResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.startTracker({
        userId: liveTrackerContext.userId,
        guildId: liveTrackerContext.guildId,
        channelId: liveTrackerContext.channelId,
        queueNumber: liveTrackerContext.queueNumber,
        players: players,
        teams: teams,
        queueStartTime: "2024-01-01T00:00:00.000Z",
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: liveTrackerContext.userId,
          guildId: liveTrackerContext.guildId,
          channelId: liveTrackerContext.channelId,
          queueNumber: liveTrackerContext.queueNumber,
          players: players,
          teams: teams,
          queueStartTime: "2024-01-01T00:00:00.000Z",
        }),
      });
      expect(infoSpy).toHaveBeenCalledWith("Starting live tracker", expect.any(Map));
    });

    it("includes interactionToken when provided", async () => {
      const mockResponse: LiveTrackerStartResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      await service.startTracker({
        userId: liveTrackerContext.userId,
        guildId: liveTrackerContext.guildId,
        channelId: liveTrackerContext.channelId,
        queueNumber: liveTrackerContext.queueNumber,
        players: players,
        teams: teams,
        queueStartTime: "2024-01-01T00:00:00.000Z",
        interactionToken: "test-token",
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://do/start",
        expect.objectContaining({
          body: expect.stringContaining('"interactionToken":"test-token"') as string,
        }),
      );
    });

    it("throws error when DO returns non-ok response", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 500,
        }),
      );

      await expect(
        service.startTracker({
          userId: liveTrackerContext.userId,
          guildId: liveTrackerContext.guildId,
          channelId: liveTrackerContext.channelId,
          queueNumber: liveTrackerContext.queueNumber,
          players: players,
          teams: teams,
          queueStartTime: "2024-01-01T00:00:00.000Z",
        }),
      ).rejects.toThrow("Failed to start live tracker: 500");

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("pauseTracker", () => {
    it("pauses a live tracker successfully", async () => {
      const mockResponse: LiveTrackerPauseResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.pauseTracker(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/pause", {
        method: "POST",
      });
      expect(infoSpy).toHaveBeenCalledWith("Pausing live tracker", expect.any(Map));
    });

    it("throws error when DO returns non-ok response", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 404,
        }),
      );

      await expect(service.pauseTracker(liveTrackerContext)).rejects.toThrow("Failed to pause live tracker: 404");
    });
  });

  describe("resumeTracker", () => {
    it("resumes a live tracker successfully", async () => {
      const mockResponse: LiveTrackerResumeResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.resumeTracker(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/resume", {
        method: "POST",
      });
    });
  });

  describe("stopTracker", () => {
    it("stops a live tracker successfully", async () => {
      const mockResponse: LiveTrackerStopResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.stopTracker(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/stop", {
        method: "POST",
      });
    });
  });

  describe("refreshTracker", () => {
    it("refreshes a live tracker successfully", async () => {
      const mockResponse: LiveTrackerRefreshResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.refreshTracker(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchCompleted: false }),
      });
    });

    it("sends matchCompleted flag when provided", async () => {
      const mockResponse: LiveTrackerRefreshResponse = {
        success: true,
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.refreshTracker(liveTrackerContext, true);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchCompleted: true }),
      });
    });

    it("handles cooldown response (429)", async () => {
      const mockResponse: LiveTrackerRefreshCooldownErrorResponse = {
        success: false,
        error: "cooldown",
        message: "Refresh cooldown active",
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 429,
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.refreshTracker(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(warnSpy).toHaveBeenCalledWith("Refresh cooldown active", expect.any(Map));
    });

    it("throws error for non-cooldown failures", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      await expect(service.refreshTracker(liveTrackerContext)).rejects.toThrow("Failed to refresh live tracker: 500");
    });
  });

  describe("recordSubstitution", () => {
    it("records a substitution successfully", async () => {
      const mockResponse: LiveTrackerSubstitutionResponse = {
        success: true,
        substitution: {
          playerOutId: "player-out",
          playerInId: "player-in",
          teamIndex: 0,
        },
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.recordSubstitution({
        context: liveTrackerContext,
        playerOutId: "player-out",
        playerInId: "player-in",
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/substitution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerOutId: "player-out",
          playerInId: "player-in",
        }),
      });
    });

    it("throws error when DO returns non-ok response", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 400,
        }),
      );

      await expect(
        service.recordSubstitution({
          context: liveTrackerContext,
          playerOutId: "player-out",
          playerInId: "player-in",
        }),
      ).rejects.toThrow("Failed to record substitution: 400");
    });
  });

  describe("getTrackerStatus", () => {
    it("gets tracker status successfully", async () => {
      const mockResponse: LiveTrackerStatusResponse = {
        state: state,
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.getTrackerStatus(liveTrackerContext);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/status", {
        method: "GET",
      });
    });

    it("returns null when DO returns non-ok response", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 404,
        }),
      );

      const result = await service.getTrackerStatus(liveTrackerContext);

      expect(result).toBeNull();
    });
  });

  describe("repostTracker", () => {
    it("reposts a tracker successfully", async () => {
      const mockResponse: LiveTrackerRepostResponse = {
        success: true,
        oldMessageId: "old-message-id",
        newMessageId: "new-message-id",
      };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue(mockResponse),
        }),
      );

      const result = await service.repostTracker({
        context: liveTrackerContext,
        newMessageId: "new-message-id",
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith("http://do/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newMessageId: "new-message-id",
        }),
      });
    });

    it("throws error when DO returns non-ok response", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 500,
        }),
      );

      await expect(
        service.repostTracker({
          context: liveTrackerContext,
          newMessageId: "new-message-id",
        }),
      ).rejects.toThrow("Failed to repost live tracker: 500");
    });
  });

  describe("discoverActiveTracker", () => {
    it("discovers an active tracker successfully", async () => {
      const getTeamsFromQueueChannelSpy = vi
        .spyOn(discordService, "getTeamsFromQueueChannel")
        .mockResolvedValue(discordNeatQueueData);

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ state: state }),
        }),
      );

      const result = await service.discoverActiveTracker({
        guildId: "test-guild",
        channelId: "test-channel",
      });

      expect(result).toEqual(state);
      expect(getTeamsFromQueueChannelSpy).toHaveBeenCalledWith("test-guild", "test-channel");
    });

    it("returns null when no queue data found", async () => {
      vi.spyOn(discordService, "getTeamsFromQueueChannel").mockResolvedValue(null);

      const result = await service.discoverActiveTracker({
        guildId: "test-guild",
        channelId: "test-channel",
      });

      expect(result).toBeNull();
    });

    it("returns null when status check fails", async () => {
      vi.spyOn(discordService, "getTeamsFromQueueChannel").mockResolvedValue(discordNeatQueueData);

      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 404,
        }),
      );

      const result = await service.discoverActiveTracker({
        guildId: "test-guild",
        channelId: "test-channel",
      });

      expect(result).toBeNull();
    });

    it("handles errors gracefully", async () => {
      vi.spyOn(discordService, "getTeamsFromQueueChannel").mockRejectedValue(new Error("Discord API error"));

      const result = await service.discoverActiveTracker({
        guildId: "test-guild",
        channelId: "test-channel",
      });

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith("Failed to discover active tracker", expect.any(Map));
    });
  });

  describe("safeStopIfActive", () => {
    it("stops an active tracker successfully", async () => {
      fetch.mockResolvedValueOnce(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ state: state }),
        }),
      );

      // Mock stop call
      fetch.mockResolvedValueOnce(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ success: true, state: state }),
        }),
      );

      const result = await service.safeStopIfActive({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
      });

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns false when no tracker found", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 404,
        }),
      );

      const result = await service.safeStopIfActive({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
      });

      expect(result).toBe(false);
      expect(debugSpy).toHaveBeenCalledWith("No tracker found to stop", expect.any(Map));
    });

    it("returns false when tracker is not in stoppable state", async () => {
      const stoppedState = { ...state, status: "stopped" as const };

      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ state: stoppedState }),
        }),
      );

      const result = await service.safeStopIfActive({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
      });

      expect(result).toBe(false);
      expect(debugSpy).toHaveBeenCalledWith("Tracker not in stoppable state", expect.any(Map));
    });

    it("handles errors gracefully", async () => {
      fetch.mockRejectedValue(new Error("Network error"));

      const result = await service.safeStopIfActive({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
      });

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith("Failed to safely stop tracker", expect.any(Map));
    });
  });

  describe("safeRecordSubstitution", () => {
    it("records substitution when tracker is active", async () => {
      // Mock status check
      fetch.mockResolvedValueOnce(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ state: state }),
        }),
      );

      // Mock substitution call
      fetch.mockResolvedValueOnce(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({
            success: true,
            substitution: {
              playerOutId: "player-out",
              playerInId: "player-in",
              teamIndex: 0,
            },
          }),
        }),
      );

      const result = await service.safeRecordSubstitution({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
        playerOutId: "player-out",
        playerInId: "player-in",
      });

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns false when no tracker found", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          ok: false,
          status: 404,
        }),
      );

      const result = await service.safeRecordSubstitution({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
        playerOutId: "player-out",
        playerInId: "player-in",
      });

      expect(result).toBe(false);
      expect(debugSpy).toHaveBeenCalledWith("No tracker found for substitution", expect.any(Map));
    });

    it("handles errors gracefully", async () => {
      fetch.mockRejectedValue(new Error("Network error"));

      const result = await service.safeRecordSubstitution({
        guildId: "test-guild",
        channelId: "test-channel",
        queueNumber: 42,
        playerOutId: "player-out",
        playerInId: "player-in",
      });

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith("Failed to safely record substitution", expect.any(Map));
    });
  });

  describe("handleRefreshCooldown", () => {
    it("updates message embed with cooldown information", async () => {
      const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
      const mockInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        message: {
          ...fakeButtonClickInteraction.message,
          id: "message-id",
          embeds: [
            {
              title: "Live Tracker",
              description: "Tracking active",
            },
          ],
          components: [],
        },
      };

      const mockResponse: LiveTrackerRefreshCooldownErrorResponse = {
        success: false,
        error: "cooldown",
        message: "Please wait 30 seconds before refreshing again",
      };

      await service.handleRefreshCooldown({
        interaction: mockInteraction,
        response: mockResponse,
      });

      expect(editMessageSpy).toHaveBeenCalledWith("fake-channel-id", "message-id", {
        embeds: [
          {
            title: "Live Tracker",
            description: "Tracking active",
            footer: {
              text: "Please wait 30 seconds before refreshing again",
            },
            timestamp: expect.any(String) as string,
          },
        ],
        components: [],
      });
    });

    it("handles missing embed gracefully", async () => {
      const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
      const mockInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        message: {
          ...fakeButtonClickInteraction.message,
          id: "message-id",
          embeds: [],
          components: [],
        },
      };

      const mockResponse: LiveTrackerRefreshCooldownErrorResponse = {
        success: false,
        error: "cooldown",
        message: "Cooldown active",
      };

      await service.handleRefreshCooldown({
        interaction: mockInteraction,
        response: mockResponse,
      });

      expect(editMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("createErrorFallbackEmbed", () => {
    it("creates fallback embed for error states", () => {
      const embed = service.createErrorFallbackEmbed(liveTrackerContext, "active");

      expect(embed).toBeDefined();
      // Since LiveTrackerEmbed is a complex class, we mainly verify it's created
    });
  });

  describe("createLiveTrackerEmbedFromResult", () => {
    it("creates embed from provided embedData", () => {
      const mockEmbedData: LiveTrackerEmbedData = {
        userId: liveTrackerContext.userId,
        guildId: liveTrackerContext.guildId,
        channelId: liveTrackerContext.channelId,
        queueNumber: liveTrackerContext.queueNumber,
        status: "active" as const,
        isPaused: false,
        lastUpdated: new Date(),
        nextCheck: undefined,
        enrichedMatches: undefined,
        seriesScore: undefined,
        errorState: undefined,
      };

      const embed = service.createLiveTrackerEmbedFromResult({
        context: liveTrackerContext,
        embedData: mockEmbedData,
        defaultStatus: "active",
      });

      expect(embed).toBeDefined();
    });

    it("creates fallback embed when no embedData provided", () => {
      const embed = service.createLiveTrackerEmbedFromResult({
        context: liveTrackerContext,
        embedData: undefined,
        defaultStatus: "paused",
        additionalTime: new Date(),
      });

      expect(embed).toBeDefined();
    });
  });

  describe("Durable Object integration", () => {
    it("generates correct Durable Object ID", async () => {
      const idFromNameSpy = vi.spyOn(env.LIVE_TRACKER_DO, "idFromName");
      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ success: true, state: state }),
        }),
      );

      await service.pauseTracker(liveTrackerContext);

      expect(idFromNameSpy).toHaveBeenCalledWith(
        `${liveTrackerContext.guildId}:${liveTrackerContext.channelId}:${liveTrackerContext.queueNumber.toString()}`,
      );
    });

    it("creates log parameters correctly", async () => {
      fetch.mockResolvedValue(
        aFakeResponseWith({
          json: vi.fn().mockResolvedValue({ success: true, state: state }),
        }),
      );

      await service.pauseTracker(liveTrackerContext);

      const logData = new Map([
        ["guildId", liveTrackerContext.guildId],
        ["channelId", liveTrackerContext.channelId],
        ["queueNumber", liveTrackerContext.queueNumber.toString()],
        ["userId", liveTrackerContext.userId],
      ]);
      expect(infoSpy).toHaveBeenCalledWith("Pausing live tracker", logData);
      expect(infoSpy).toHaveBeenCalledWith("Live tracker paused successfully", logData);
    });
  });
});
