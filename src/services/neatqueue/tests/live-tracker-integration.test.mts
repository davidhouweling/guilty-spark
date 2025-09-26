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
import { aFakeDurableObjectId, aFakeLiveTrackerDOWith } from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import type { LiveTrackerDO } from "../../../durable-objects/live-tracker-do.mjs";
import { guild, textChannel, guildMember } from "../../discord/fakes/data.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeLiveTrackerServiceWith } from "../../live-tracker/fakes/live-tracker.fake.mjs";
import type {
  NeatQueueMatchCompletedRequest,
  NeatQueueSubstitutionRequest,
  NeatQueueTeamsCreatedRequest,
} from "../types.mjs";

describe("NeatQueueService Live Tracker Integration", () => {
  // align this with time just after ctf.json match completed
  const now = new Date("2024-11-26T10:48:00.000Z").getTime();

  let env: Env;
  let logService: LogService;
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let haloService: HaloService;
  let neatQueueService: NeatQueueService;

  let fetchSpy: MockInstance<LiveTrackerDO["fetch"]>;
  let getGuildConfigSpy: MockInstance<DatabaseService["getGuildConfig"]>;
  let idFromNameSpy: MockInstance<DurableObjectNamespace["idFromName"]>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    const liveTrackerService = aFakeLiveTrackerServiceWith({ logService, discordService, env });
    neatQueueService = new NeatQueueService({
      env,
      logService,
      databaseService,
      discordService,
      haloService,
      liveTrackerService,
    });

    const liveTrackerDO = aFakeLiveTrackerDOWith();
    vi.spyOn(env.LIVE_TRACKER_DO, "get").mockReturnValue(liveTrackerDO);
    idFromNameSpy = vi.spyOn(env.LIVE_TRACKER_DO, "idFromName").mockReturnValue(aFakeDurableObjectId());
    fetchSpy = vi.spyOn(liveTrackerDO, "fetch");

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
      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/start") as string,
        }),
      );
    });

    it("does not start live tracking when disabled in guild config", async () => {
      getGuildConfigSpy.mockResolvedValue(
        aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
        }),
      );

      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("handles missing guild config gracefully", async () => {
      const mockGuildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTracking: "N",
      });
      getGuildConfigSpy.mockResolvedValue(mockGuildConfig);

      await callTeamsCreatedJob(mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("logs errors when live tracking fails to start", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      fetchSpy.mockRejectedValue(new Error("DO start failed"));

      await callTeamsCreatedJob(mockRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-start live tracking"),
        expect.any(Map),
      );
    });

    it("continues normal operation if live tracking fails", async () => {
      fetchSpy.mockRejectedValue(new Error("DO start failed"));

      // Should not throw error, just log it
      await expect(callTeamsCreatedJob(mockRequest)).resolves.toBeUndefined();
    });

    it("generates consistent DO IDs for same guild/channel/queue", async () => {
      const testRequest = getFakeNeatQueueData("teamsCreated");
      const expectedDoId = `${testRequest.guild}:${testRequest.channel}:${testRequest.match_number.toString()}`;

      await callTeamsCreatedJob(testRequest);

      expect(idFromNameSpy).toHaveBeenCalledWith(expectedDoId);
    });

    it("generates different DO IDs for different parameters", async () => {
      const testRequest = {
        ...getFakeNeatQueueData("teamsCreated"),
        guild: "guild456",
        channel: "channel789",
        match_number: 100,
      };

      await callTeamsCreatedJob(testRequest);

      expect(idFromNameSpy).toHaveBeenCalledWith("guild456:channel789:100");
    });

    it("handles database service errors gracefully", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      getGuildConfigSpy.mockRejectedValue(new Error("Database error"));

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(testRequest);

      expect(logWarnSpy).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("handles Durable Object namespace errors", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      idFromNameSpy.mockImplementation(() => {
        throw new Error("DO namespace error");
      });

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
      await callSubstitutionJob(mockRequest);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/substitution") as string,
        }),
      );
    });

    it("skips update when no match number is provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match_number, ...requestWithoutMatchNumber } = mockRequest;

      await callSubstitutionJob(requestWithoutMatchNumber);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(idFromNameSpy).not.toHaveBeenCalled();
    });

    it("skips update when live tracker is not active", async () => {
      fetchSpy.mockImplementation(async (input: Request | string | URL): Promise<Response> => {
        await Promise.resolve(); // Satisfy async requirement
        const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const urlObj = new URL(urlString);
        if (urlObj.pathname === "/status") {
          return new Response("Not Found", { status: 404 });
        }
        return new Response("Should not reach here", { status: 500 });
      });

      await callSubstitutionJob(mockRequest);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      // Should not call substitution endpoint when status is not ok
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/substitution") as string,
        }),
      );
    });

    it("logs warning when substitution update fails", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      // Override the fake DO to throw an error on substitution
      const failingLiveTrackerDO = aFakeLiveTrackerDOWith({
        shouldThrowError: true,
        errorMessage: "Substitution failed",
      });
      vi.spyOn(env.LIVE_TRACKER_DO, "get").mockReturnValue(failingLiveTrackerDO);

      await callSubstitutionJob(mockRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update live tracker with substitution"),
        expect.any(Map),
      );
    });

    it("continues normal operation if live tracker update fails", async () => {
      fetchSpy.mockRejectedValue(new Error("DO substitution failed"));

      // Should not throw error, just log it
      await expect(callSubstitutionJob(mockRequest)).resolves.toBeUndefined();
    });

    it("generates consistent DO IDs for same guild/channel/queue", async () => {
      const testRequest = getFakeNeatQueueData("substitution");
      const expectedDoId = `${testRequest.guild}:${testRequest.channel}:${testRequest.match_number?.toString() ?? "undefined"}`;

      await callSubstitutionJob(testRequest);

      expect(idFromNameSpy).toHaveBeenCalledWith(expectedDoId);
    });

    it("handles Durable Object namespace errors gracefully", async () => {
      const logWarnSpy = vi.spyOn(logService, "warn");
      idFromNameSpy.mockImplementation(() => {
        throw new Error("DO namespace error");
      });

      const testRequest = getFakeNeatQueueData("substitution");
      await callSubstitutionJob(testRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update live tracker with substitution"),
        expect.any(Map),
      );
    });

    it("sends correct substitution data to live tracker", async () => {
      await callSubstitutionJob(mockRequest);

      // Verify that both status and substitution endpoints were called
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/substitution") as string,
        }),
      );
    });

    it("logs successful substitution update", async () => {
      const logInfoSpy = vi.spyOn(logService, "info");

      await callSubstitutionJob(mockRequest);

      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Updated live tracker with substitution"),
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
      // Simulate match completion event processing
      await callMatchCompletedJob(mockMatchCompletedRequest);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/stop") as string,
        }),
      );
    });
  });
});
