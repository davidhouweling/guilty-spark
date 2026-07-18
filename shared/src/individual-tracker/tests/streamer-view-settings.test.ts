import { describe, expect, it } from "vitest";
import {
  DEFAULT_STREAMER_VIEW_SETTINGS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  withStreamerViewSettingsDefaults,
} from "../streamer-view-settings";

describe("DEFAULT_STREAMER_VIEW_SETTINGS", () => {
  it("uses the default stats highlight slot count", () => {
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.visibleSections?.statsHighlightSlots).toHaveLength(
      INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
    );
  });

  it("includes defaults for recently added tab and history settings", () => {
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.styleFlags?.inSeriesShowTabs).toBe(true);
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.styleFlags?.matchmakingShowTabs).toBe(true);
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.visibleSections?.maxPreviousGamesToShow).toBe(9);
  });
});

describe("withStreamerViewSettingsDefaults()", () => {
  it("fills missing stats highlight slots using the default slot count", () => {
    const settings = withStreamerViewSettingsDefaults({});

    expect(settings.visibleSections?.statsHighlightSlots).toHaveLength(INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);
  });

  it("fills missing recently added tab and history settings", () => {
    const settings = withStreamerViewSettingsDefaults({});

    expect(settings.styleFlags?.inSeriesShowTabs).toBe(true);
    expect(settings.styleFlags?.matchmakingShowTabs).toBe(true);
    expect(settings.visibleSections?.maxPreviousGamesToShow).toBe(9);
  });
});
