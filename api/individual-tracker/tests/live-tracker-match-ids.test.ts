import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { LiveTrackerService } from "../../services/live-tracker/live-tracker";
import { aFakeLiveTrackerServiceWith } from "../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerStateWith } from "../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import { resolveLiveTrackerMatchIds } from "../live-tracker-match-ids";

describe("resolveLiveTrackerMatchIds()", () => {
  let liveTrackerService: LiveTrackerService;
  let getStatusSpy: MockInstance<typeof liveTrackerService.getTrackerStatusByQueue>;

  beforeEach(() => {
    liveTrackerService = aFakeLiveTrackerServiceWith();
    getStatusSpy = vi.spyOn(liveTrackerService, "getTrackerStatusByQueue").mockResolvedValue(null);
  });

  it("returns the live tracker's match ids when active", async () => {
    getStatusSpy.mockResolvedValue({ state: aFakeLiveTrackerStateWith({ status: "active", matchIds: ["m1", "m2"] }) });

    const result = await resolveLiveTrackerMatchIds(liveTrackerService, "guild-1", 5);

    expect(getStatusSpy).toHaveBeenCalledWith("guild-1", 5);
    expect(result).toEqual(["m1", "m2"]);
  });

  it("returns match ids from a paused live tracker", async () => {
    getStatusSpy.mockResolvedValue({ state: aFakeLiveTrackerStateWith({ status: "paused", matchIds: ["m1"] }) });

    const result = await resolveLiveTrackerMatchIds(liveTrackerService, "guild-1", 5);

    expect(result).toEqual(["m1"]);
  });

  it("returns an empty array when the live tracker is stopped", async () => {
    getStatusSpy.mockResolvedValue({ state: aFakeLiveTrackerStateWith({ status: "stopped", matchIds: ["m1"] }) });

    const result = await resolveLiveTrackerMatchIds(liveTrackerService, "guild-1", 5);

    expect(result).toEqual([]);
  });

  it("returns an empty array when no live tracker exists for the queue", async () => {
    getStatusSpy.mockResolvedValue(null);

    const result = await resolveLiveTrackerMatchIds(liveTrackerService, "guild-1", 5);

    expect(result).toEqual([]);
  });

  it("propagates an error from the status lookup", async () => {
    getStatusSpy.mockRejectedValue(new Error("DO unavailable"));

    await expect(resolveLiveTrackerMatchIds(liveTrackerService, "guild-1", 5)).rejects.toThrow("DO unavailable");
  });
});
