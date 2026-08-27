import { describe, expect, it, vi } from "vitest";
import type { TrackerLiveView } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { aFakeIndividualTrackerServiceWith, aFakeTrackerWith } from "../individual-tracker.fake";

describe("FakeIndividualTrackerService (fake mode)", () => {
  it("startSeries persists title/subtitle/teams and marks hasActiveSeries", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "", xuid: "" });
    const service = aFakeIndividualTrackerServiceWith({ trackers: [tracker] });

    await service.startSeries({
      trackerId: "t1",
      titleOverride: "Midnight Customs",
      subtitleOverride: "Queue #12",
      teams: [{ name: "Eagle", members: ["Chief"] }],
    });

    const { tracker: updated } = await service.getTrackerStatus("t1");
    expect(updated.state?.hasActiveSeries).toBe(true);
  });

  it("connectToTracker emits a view with the activeSeriesContext set by startSeries", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "", xuid: "" });
    const service = aFakeIndividualTrackerServiceWith({ trackers: [tracker] });
    await service.startSeries({
      trackerId: "t1",
      titleOverride: "Midnight Customs",
      subtitleOverride: "Queue #12",
      teams: [{ name: "Eagle", members: ["Chief", "Arbiter"] }],
    });

    const listener = vi.fn<(view: TrackerLiveView) => void>();
    service.connectToTracker("user-1", "t1").subscribe(listener);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });

    const [[view]] = listener.mock.calls;
    expect(view.hasActiveSeries).toBe(true);
    expect(view.activeSeriesContext).toEqual({
      title: "Midnight Customs",
      subtitle: "Queue #12",
      teams: [
        {
          id: 0,
          name: "Eagle",
          players: [
            { discordId: null, discordName: null, gamertag: "Chief", xboxId: null },
            { discordId: null, discordName: null, gamertag: "Arbiter", xboxId: null },
          ],
        },
      ],
    });
  });

  it("editSeries merges partial updates onto the existing series", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "", xuid: "" });
    const service = aFakeIndividualTrackerServiceWith({ trackers: [tracker] });
    await service.startSeries({
      trackerId: "t1",
      titleOverride: "Midnight Customs",
      subtitleOverride: "Queue #12",
      teams: [{ name: "Eagle", members: ["Chief"] }],
    });

    await service.editSeries("t1", { titleOverride: "Updated Title" });

    const listener = vi.fn<(view: TrackerLiveView) => void>();
    service.connectToTracker("user-1", "t1").subscribe(listener);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });
    const [[view]] = listener.mock.calls;
    expect(view.activeSeriesContext?.title).toBe("Updated Title");
    expect(view.activeSeriesContext?.subtitle).toBe("Queue #12");
  });

  it("endSeries clears the active series and hasActiveSeries", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "", xuid: "" });
    const service = aFakeIndividualTrackerServiceWith({ trackers: [tracker] });
    await service.startSeries({
      trackerId: "t1",
      titleOverride: "Midnight Customs",
      subtitleOverride: "Queue #12",
      teams: [{ name: "Eagle", members: ["Chief"] }],
    });

    await service.endSeries("t1");

    const { tracker: updated } = await service.getTrackerStatus("t1");
    expect(updated.state?.hasActiveSeries).toBe(false);
  });

  it("re-emits an updated view to an already-subscribed listener when the series is edited", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "", xuid: "" });
    const service = aFakeIndividualTrackerServiceWith({ trackers: [tracker] });
    await service.startSeries({
      trackerId: "t1",
      titleOverride: "Midnight Customs",
      subtitleOverride: "Queue #12",
      teams: [{ name: "Eagle", members: ["Chief"] }],
    });

    const listener = vi.fn<(view: TrackerLiveView) => void>();
    service.connectToTracker("user-1", "t1").subscribe(listener);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });

    await service.editSeries("t1", { titleOverride: "Updated Title" });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2);
    });
    const [, [lastCallView]] = listener.mock.calls;
    expect(lastCallView.activeSeriesContext?.title).toBe("Updated Title");
  });
});
