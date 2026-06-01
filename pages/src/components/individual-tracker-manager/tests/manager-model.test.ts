import { describe, expect, it } from "vitest";
import { aFakeTrackerWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  MAX_TRACKERS,
  isValidGamertagInput,
  isValidIdleTimeoutHoursInput,
  isValidSearchStartTimeInput,
  parseIdleTimeoutHours,
  parseSearchStartTime,
  toManagerModel,
  toTrackerRowModel,
} from "../manager-model";

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

describe("parseIdleTimeoutHours", () => {
  it("returns null for blank input", () => {
    expect(parseIdleTimeoutHours("")).toBeNull();
    expect(parseIdleTimeoutHours("   ")).toBeNull();
  });

  it("returns null for a non-positive or non-numeric value", () => {
    expect(parseIdleTimeoutHours("0")).toBeNull();
    expect(parseIdleTimeoutHours("-2")).toBeNull();
    expect(parseIdleTimeoutHours("abc")).toBeNull();
  });

  it("parses a positive number", () => {
    expect(parseIdleTimeoutHours(" 12 ")).toBe(12);
    expect(parseIdleTimeoutHours("1.5")).toBe(1.5);
  });
});

describe("isValidIdleTimeoutHoursInput", () => {
  it("accepts blank input and positive numbers", () => {
    expect(isValidIdleTimeoutHoursInput("")).toBe(true);
    expect(isValidIdleTimeoutHoursInput("6")).toBe(true);
  });

  it("rejects non-positive or non-numeric input", () => {
    expect(isValidIdleTimeoutHoursInput("0")).toBe(false);
    expect(isValidIdleTimeoutHoursInput("nope")).toBe(false);
  });
});

describe("parseSearchStartTime", () => {
  it("returns null for blank input", () => {
    expect(parseSearchStartTime("")).toBeNull();
    expect(parseSearchStartTime("   ")).toBeNull();
  });

  it("returns null for an unparseable datetime", () => {
    expect(parseSearchStartTime("not-a-date")).toBeNull();
  });

  it("normalises a valid datetime to an ISO string", () => {
    expect(parseSearchStartTime("2026-01-02T03:04")).toBe(new Date("2026-01-02T03:04").toISOString());
  });
});

describe("isValidSearchStartTimeInput", () => {
  it("accepts blank input and valid datetimes", () => {
    expect(isValidSearchStartTimeInput("")).toBe(true);
    expect(isValidSearchStartTimeInput("2026-01-02T03:04")).toBe(true);
  });

  it("rejects an unparseable datetime", () => {
    expect(isValidSearchStartTimeInput("not-a-date")).toBe(false);
  });
});
