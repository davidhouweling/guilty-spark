import { describe, expect, it } from "vitest";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { shouldHideShortDurationMatch } from "../match-duration-filter";

function aMatchWith(
  overrides: Partial<Pick<TrackerMatchHistoryEntry, "startTime" | "endTime" | "startTimeIso" | "endTimeIso">>,
): TrackerMatchHistoryEntry {
  return {
    matchId: "match-1",
    startTime: overrides.startTime ?? "Jan 1, 2026, 12:00:00 AM",
    endTime: overrides.endTime ?? "Jan 1, 2026, 12:10:00 AM",
    startTimeIso: overrides.startTimeIso,
    endTimeIso: overrides.endTimeIso,
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    modeAssetId: "mode-1",
    modeVersionId: "mode-version-1",
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

describe("shouldHideShortDurationMatch", () => {
  it("returns true for a match shorter than 2 minutes using ISO timestamps", () => {
    const entry = aMatchWith({
      startTimeIso: "2026-01-01T12:00:00.000Z",
      endTimeIso: "2026-01-01T12:01:30.000Z",
    });

    expect(shouldHideShortDurationMatch(entry)).toBe(true);
  });

  it("returns false for a match exactly 2 minutes using ISO timestamps", () => {
    const entry = aMatchWith({
      startTimeIso: "2026-01-01T12:00:00.000Z",
      endTimeIso: "2026-01-01T12:02:00.000Z",
    });

    expect(shouldHideShortDurationMatch(entry)).toBe(false);
  });

  it("returns false for a match longer than 2 minutes using ISO timestamps", () => {
    const entry = aMatchWith({
      startTimeIso: "2026-01-01T12:00:00.000Z",
      endTimeIso: "2026-01-01T12:15:00.000Z",
    });

    expect(shouldHideShortDurationMatch(entry)).toBe(false);
  });

  it("falls back to startTime and endTime when ISO fields are absent", () => {
    const entry = aMatchWith({
      startTime: "2026-01-01T12:00:00.000Z",
      endTime: "2026-01-01T12:01:00.000Z",
    });

    expect(shouldHideShortDurationMatch(entry)).toBe(true);
  });

  it("prefers ISO timestamps over legacy time fields when both are present", () => {
    const entry = aMatchWith({
      startTime: "2026-01-01T12:00:00.000Z",
      endTime: "2026-01-01T12:01:00.000Z",
      startTimeIso: "2026-01-01T12:00:00.000Z",
      endTimeIso: "2026-01-01T12:15:00.000Z",
    });

    expect(shouldHideShortDurationMatch(entry)).toBe(false);
  });
});
