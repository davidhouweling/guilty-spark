import { describe, expect, it } from "vitest";
import { aFakeTrackerWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { MAX_TRACKERS, isValidGamertagInput, toManagerModel, toTrackerRowModel } from "../manager-model";

describe("toTrackerRowModel", () => {
  it("maps an active live tracker to a row with stop and pause enabled and set-live hidden", () => {
    const row = toTrackerRowModel(aFakeTrackerWith({ status: "active", isLive: true }));

    expect(row.statusLabel).toBe("Active");
    expect(row.isLive).toBe(true);
    expect(row.canStop).toBe(true);
    expect(row.canPause).toBe(true);
    expect(row.canResume).toBe(false);
    expect(row.canSetLive).toBe(false);
  });

  it("enables set-live for an active tracker that is not currently live", () => {
    const row = toTrackerRowModel(aFakeTrackerWith({ status: "active", isLive: false }));

    expect(row.canSetLive).toBe(true);
  });

  it("maps a paused tracker so resume is enabled and pause is disabled", () => {
    const row = toTrackerRowModel(aFakeTrackerWith({ status: "paused", isLive: false }));

    expect(row.statusLabel).toBe("Paused");
    expect(row.canPause).toBe(false);
    expect(row.canResume).toBe(true);
    expect(row.canStop).toBe(true);
    expect(row.canSetLive).toBe(true);
  });

  it("disables all actions except none for a stopped tracker", () => {
    const row = toTrackerRowModel(aFakeTrackerWith({ status: "stopped", isLive: false }));

    expect(row.statusLabel).toBe("Stopped");
    expect(row.canStop).toBe(false);
    expect(row.canPause).toBe(false);
    expect(row.canResume).toBe(false);
    expect(row.canSetLive).toBe(false);
  });
});

describe("toManagerModel", () => {
  it("reports an empty model when there are no trackers", () => {
    const model = toManagerModel([]);

    expect(model.isEmpty).toBe(true);
    expect(model.rows).toHaveLength(0);
    expect(model.trackerCount).toBe(0);
    expect(model.isAtLimit).toBe(false);
    expect(model.canAddTracker).toBe(true);
  });

  it("maps each tracker to a row and allows adding below the limit", () => {
    const model = toManagerModel([
      aFakeTrackerWith({ trackerId: "a", gamertag: "Alpha" }),
      aFakeTrackerWith({ trackerId: "b", gamertag: "Bravo" }),
    ]);

    expect(model.isEmpty).toBe(false);
    expect(model.rows.map((row) => row.gamertag)).toStrictEqual(["Alpha", "Bravo"]);
    expect(model.trackerCount).toBe(2);
    expect(model.canAddTracker).toBe(true);
  });

  it("flags the limit and blocks adding at the maximum number of trackers", () => {
    const trackers = Array.from({ length: MAX_TRACKERS }, (_unused, index) =>
      aFakeTrackerWith({ trackerId: `t-${index.toString()}` }),
    );

    const model = toManagerModel(trackers);

    expect(model.trackerCount).toBe(MAX_TRACKERS);
    expect(model.isAtLimit).toBe(true);
    expect(model.canAddTracker).toBe(false);
  });
});

describe("isValidGamertagInput", () => {
  it("accepts a non-empty trimmed value", () => {
    expect(isValidGamertagInput("Master Chief")).toBe(true);
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(isValidGamertagInput("")).toBe(false);
    expect(isValidGamertagInput("   ")).toBe(false);
  });
});
