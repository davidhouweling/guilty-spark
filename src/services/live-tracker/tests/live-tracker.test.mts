import { describe, it, expect } from "vitest";
import { LiveTrackerService } from "../live-tracker.mjs";

describe("LiveTrackerService", () => {
  it("should be importable", () => {
    expect(LiveTrackerService).toBeDefined();
  });
});
