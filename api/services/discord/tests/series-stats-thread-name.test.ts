import { describe, expect, it } from "vitest";
import { getSeriesStatsThreadName } from "../series-stats-thread-name";

describe("getSeriesStatsThreadName", () => {
  it("includes the series score when provided", () => {
    expect(getSeriesStatsThreadName(42, "3:1")).toBe("Queue #42 series stats (3:1)");
  });

  it("returns the generic name when no series score is provided", () => {
    expect(getSeriesStatsThreadName(42)).toBe("Queue #42 series stats");
  });

  it("returns the generic name when the series score is empty", () => {
    expect(getSeriesStatsThreadName(42, "")).toBe("Queue #42 series stats");
  });
});
