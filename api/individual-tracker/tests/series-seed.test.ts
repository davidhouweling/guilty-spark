import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { LiveTrackerService } from "../../services/live-tracker/live-tracker";
import { aFakeLiveTrackerServiceWith } from "../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerStateWith } from "../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import type { LogService } from "../../services/log/types";
import { aFakeLogServiceWith } from "../../services/log/fakes/log.fake";
import type { NeatQueueService } from "../../services/neatqueue/neatqueue";
import { aFakeNeatQueueServiceWith } from "../../services/neatqueue/fakes/neatqueue.fake";
import type { ActiveSeriesForPlayer } from "../../services/neatqueue/types";
import { resolveSeriesSeed } from "../series-seed";

function anActiveSeriesForPlayerWith(overrides: Partial<ActiveSeriesForPlayer> = {}): ActiveSeriesForPlayer {
  return {
    guildId: "guild-1",
    queueNumber: 5,
    seriesContext: {
      type: "started",
      title: "Test Server",
      subtitle: "Queue #5",
      guildIconUrl: "https://cdn.example.com/icon.webp",
      startedAt: "2026-08-01T10:00:00.000Z",
      searchStartTime: "2026-08-01T09:30:00.000Z",
      teams: [],
    },
    ...overrides,
  };
}

describe("resolveSeriesSeed()", () => {
  let neatQueueService: NeatQueueService;
  let liveTrackerService: LiveTrackerService;
  let logService: LogService;
  let findActiveSeriesSpy: MockInstance<typeof neatQueueService.findActiveSeriesForPlayer>;
  let getStatusSpy: MockInstance<typeof liveTrackerService.getTrackerStatusByQueue>;

  const resolve = async (): Promise<ReturnType<typeof resolveSeriesSeed>> =>
    resolveSeriesSeed({ neatQueueService, liveTrackerService, logService, xuid: "xuid-1", gamertag: "Chief" });

  beforeEach(() => {
    neatQueueService = aFakeNeatQueueServiceWith();
    liveTrackerService = aFakeLiveTrackerServiceWith();
    logService = aFakeLogServiceWith();
    findActiveSeriesSpy = vi.spyOn(neatQueueService, "findActiveSeriesForPlayer").mockResolvedValue(null);
    getStatusSpy = vi.spyOn(liveTrackerService, "getTrackerStatusByQueue").mockResolvedValue(null);
  });

  it("returns null when the player has no active series", async () => {
    await expect(resolve()).resolves.toBeNull();
    expect(findActiveSeriesSpy).toHaveBeenCalledWith("xuid-1", "Chief");
    expect(getStatusSpy).not.toHaveBeenCalled();
  });

  it("returns a seed with live tracker match ids when the live tracker is active", async () => {
    findActiveSeriesSpy.mockResolvedValue(anActiveSeriesForPlayerWith());
    getStatusSpy.mockResolvedValue({
      state: aFakeLiveTrackerStateWith({ status: "active", matchIds: ["m1", "m2"] }),
    });

    const seed = await resolve();

    expect(getStatusSpy).toHaveBeenCalledWith("guild-1", 5);
    expect(seed).toEqual({
      title: "Test Server",
      subtitle: "Queue #5",
      guildIconUrl: "https://cdn.example.com/icon.webp",
      startedAt: "2026-08-01T10:00:00.000Z",
      searchStartTime: "2026-08-01T09:30:00.000Z",
      teams: [],
      matchIds: ["m1", "m2"],
    });
  });

  it("returns a seed without matches when no live tracker exists for the queue", async () => {
    findActiveSeriesSpy.mockResolvedValue(anActiveSeriesForPlayerWith());
    getStatusSpy.mockResolvedValue(null);

    const seed = await resolve();

    expect(seed?.matchIds).toEqual([]);
  });

  it("returns a seed without matches when the live tracker is stopped", async () => {
    findActiveSeriesSpy.mockResolvedValue(anActiveSeriesForPlayerWith());
    getStatusSpy.mockResolvedValue({
      state: aFakeLiveTrackerStateWith({ status: "stopped", matchIds: ["m1"] }),
    });

    const seed = await resolve();

    expect(seed?.matchIds).toEqual([]);
  });

  it("returns a seed with matches from a paused live tracker", async () => {
    findActiveSeriesSpy.mockResolvedValue(anActiveSeriesForPlayerWith());
    getStatusSpy.mockResolvedValue({
      state: aFakeLiveTrackerStateWith({ status: "paused", matchIds: ["m1"] }),
    });

    const seed = await resolve();

    expect(seed?.matchIds).toEqual(["m1"]);
  });

  it("returns a seed without matches when the live tracker status lookup throws", async () => {
    findActiveSeriesSpy.mockResolvedValue(anActiveSeriesForPlayerWith());
    getStatusSpy.mockRejectedValue(new Error("DO unavailable"));

    const seed = await resolve();

    expect(seed?.matchIds).toEqual([]);
  });

  it("omits searchStartTime when the series context does not include one", async () => {
    findActiveSeriesSpy.mockResolvedValue(
      anActiveSeriesForPlayerWith({
        seriesContext: {
          type: "started",
          title: "Test Server",
          subtitle: "Queue #5",
          guildIconUrl: null,
          startedAt: "2026-08-01T10:00:00.000Z",
          teams: [],
        },
      }),
    );

    const seed = await resolve();

    expect(seed).not.toHaveProperty("searchStartTime");
  });

  it("returns null without throwing when the active series lookup fails", async () => {
    findActiveSeriesSpy.mockRejectedValue(new Error("KV unavailable"));

    await expect(resolve()).resolves.toBeNull();
  });
});
