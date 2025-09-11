import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import { NeatQueueService } from "../neatqueue.mjs";
import type { Services } from "../../install.mjs";
import { installFakeServicesWith } from "../../fakes/services.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeGuildConfigRow } from "../../database/fakes/database.fake.mjs";
import { getFakeNeatQueueData } from "../fakes/data.mjs";
import type { NeatQueueTeamsCreatedRequest, NeatQueueMatchCompletedRequest } from "../types.mjs";
import { aFakeDurableObjectId } from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import { guild, textChannel, guildMember } from "../../discord/fakes/data.mjs";

// Helper function to avoid unsafe type casts
async function callTeamsCreatedJob(instance: NeatQueueService, request: NeatQueueTeamsCreatedRequest): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return (instance as any).teamsCreatedJob(request) as Promise<void>;
}

async function callStopLiveTrackingIfActive(
  instance: NeatQueueService,
  request: NeatQueueMatchCompletedRequest,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return (instance as any).stopLiveTrackingIfActive(request, null) as Promise<void>;
}

describe("NeatQueueService Live Tracker Integration", () => {
  let neatQueueService: NeatQueueService;
  let services: Services;
  let env: Env;
  let mockDurableObjectFetch: MockInstance;
  let getGuildConfigSpy: MockInstance;
  let idFromNameSpy: MockInstance;

  beforeEach(() => {
    services = installFakeServicesWith();
    env = aFakeEnvWith();
    neatQueueService = new NeatQueueService({ ...services, env });

    // Mock Durable Object methods with proper typing
    mockDurableObjectFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));

    // Create a properly typed mock stub
    const mockDurableObjectStub = {
      fetch: mockDurableObjectFetch,
      connect: vi.fn(),
      id: aFakeDurableObjectId(),
      name: "test-stub",
    } as unknown as DurableObjectStub;

    vi.spyOn(env.LIVE_TRACKER_DO, "get").mockReturnValue(mockDurableObjectStub);
    idFromNameSpy = vi.spyOn(env.LIVE_TRACKER_DO, "idFromName").mockReturnValue(aFakeDurableObjectId());

    // Mock database service
    getGuildConfigSpy = vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
      aFakeGuildConfigRow({
        NeatQueueInformerLiveTracking: "Y",
      }),
    );

    // Mock Discord service for permission checks
    vi.spyOn(services.discordService, "getGuild").mockResolvedValue(guild);
    vi.spyOn(services.discordService, "getChannel").mockResolvedValue(textChannel);
    vi.spyOn(services.discordService, "getGuildMember").mockResolvedValue(guildMember);
    vi.spyOn(services.discordService, "hasPermissions").mockReturnValue({
      hasAll: true,
      missing: [],
    });
  });

  describe("teamsCreatedJob", () => {
    const mockRequest = getFakeNeatQueueData("teamsCreated");

    it("starts live tracking when enabled in guild config", async () => {
      await callTeamsCreatedJob(neatQueueService, mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(mockDurableObjectFetch).toHaveBeenCalledWith(
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

      await callTeamsCreatedJob(neatQueueService, mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(mockDurableObjectFetch).not.toHaveBeenCalled();
    });

    it("handles missing guild config gracefully", async () => {
      const mockGuildConfig = aFakeGuildConfigRow({
        NeatQueueInformerLiveTracking: "N",
      });
      getGuildConfigSpy.mockResolvedValue(mockGuildConfig);

      await callTeamsCreatedJob(neatQueueService, mockRequest);

      expect(getGuildConfigSpy).toHaveBeenCalledWith(mockRequest.guild);
      expect(mockDurableObjectFetch).not.toHaveBeenCalled();
    });

    it("logs errors when live tracking fails to start", async () => {
      const logWarnSpy = vi.spyOn(services.logService, "warn");
      mockDurableObjectFetch.mockRejectedValue(new Error("DO start failed"));

      await callTeamsCreatedJob(neatQueueService, mockRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-start live tracking"),
        expect.any(Map),
      );
    });

    it("continues normal operation if live tracking fails", async () => {
      mockDurableObjectFetch.mockRejectedValue(new Error("DO start failed"));

      // Should not throw error, just log it
      await expect(callTeamsCreatedJob(neatQueueService, mockRequest)).resolves.toBeUndefined();
    });
  });

  describe("stopLiveTrackingIfActive", () => {
    it("stops live tracking when called", async () => {
      // Mock status response to indicate active tracker
      mockDurableObjectFetch.mockResolvedValueOnce(new Response(JSON.stringify({ state: { status: "active" } })));
      // Mock stop response
      mockDurableObjectFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      const stopRequest = getFakeNeatQueueData("matchCompleted");
      await callStopLiveTrackingIfActive(neatQueueService, stopRequest);

      expect(mockDurableObjectFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      expect(mockDurableObjectFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/stop") as string,
        }),
      );
    });

    it("logs errors when stop fails", async () => {
      const logWarnSpy = vi.spyOn(services.logService, "warn");
      mockDurableObjectFetch.mockRejectedValue(new Error("DO stop failed"));

      const stopRequest = getFakeNeatQueueData("matchCompleted");
      await callStopLiveTrackingIfActive(neatQueueService, stopRequest);

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-stop live tracking"),
        expect.any(Map),
      );
    });

    it("continues normal operation if stop fails", async () => {
      mockDurableObjectFetch.mockRejectedValue(new Error("DO stop failed"));

      const stopRequest = getFakeNeatQueueData("matchCompleted");

      // Should not throw error, just log it
      await expect(callStopLiveTrackingIfActive(neatQueueService, stopRequest)).resolves.toBeUndefined();
    });
  });

  describe("MATCH_COMPLETED event integration", () => {
    const mockMatchCompletedRequest = getFakeNeatQueueData("matchCompleted");

    it("calls stopLiveTrackingIfActive on match completion", async () => {
      // Mock status response to indicate active tracker
      mockDurableObjectFetch.mockResolvedValueOnce(new Response(JSON.stringify({ state: { status: "active" } })));
      // Mock stop response
      mockDurableObjectFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      // Simulate match completion event processing
      await callStopLiveTrackingIfActive(neatQueueService, mockMatchCompletedRequest);

      expect(mockDurableObjectFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: expect.stringContaining("/status") as string,
        }),
      );
      expect(mockDurableObjectFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expect.stringContaining("/stop") as string,
        }),
      );
    });
  });

  describe("Durable Object ID generation", () => {
    it("generates consistent DO IDs for same guild/channel/queue", async () => {
      const testRequest = getFakeNeatQueueData("teamsCreated");
      const expectedDoId = `${testRequest.guild}:${testRequest.channel}:${testRequest.match_number.toString()}`;

      await callTeamsCreatedJob(neatQueueService, testRequest);

      expect(idFromNameSpy).toHaveBeenCalledWith(expectedDoId);
    });

    it("generates different DO IDs for different parameters", async () => {
      const testRequest = {
        ...getFakeNeatQueueData("teamsCreated"),
        guild: "guild456",
        channel: "channel789",
        match_number: 100,
      };

      await callTeamsCreatedJob(neatQueueService, testRequest);

      expect(idFromNameSpy).toHaveBeenCalledWith("guild456:channel789:100");
    });
  });

  describe("Integration error scenarios", () => {
    it("handles database service errors gracefully", async () => {
      const logWarnSpy = vi.spyOn(services.logService, "warn");
      getGuildConfigSpy.mockRejectedValue(new Error("Database error"));

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(neatQueueService, testRequest);

      expect(logWarnSpy).toHaveBeenCalled();
      expect(mockDurableObjectFetch).not.toHaveBeenCalled();
    });

    it("handles Durable Object namespace errors", async () => {
      const logWarnSpy = vi.spyOn(services.logService, "warn");
      idFromNameSpy.mockImplementation(() => {
        throw new Error("DO namespace error");
      });

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(neatQueueService, testRequest);

      expect(logWarnSpy).toHaveBeenCalled();
    });
  });

  describe("Performance considerations", () => {
    it("does not delay normal NeatQueue operations", async () => {
      const startTime = Date.now();

      const testRequest = getFakeNeatQueueData("teamsCreated");
      await callTeamsCreatedJob(neatQueueService, testRequest);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Live tracking integration should be fast (< 100ms)
      expect(duration).toBeLessThan(100);
    });

    it("handles concurrent live tracking requests", async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        ...getFakeNeatQueueData("teamsCreated"),
        guild: `guild${String(i)}`,
        channel: `channel${String(i)}`,
        match_number: i + 1,
      }));

      const promises = requests.map(async (request) => callTeamsCreatedJob(neatQueueService, request));

      await Promise.all(promises);

      expect(mockDurableObjectFetch).toHaveBeenCalledTimes(5);
    });
  });
});
