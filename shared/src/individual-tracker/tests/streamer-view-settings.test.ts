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
});

describe("withStreamerViewSettingsDefaults()", () => {
  it("fills missing stats highlight slots using the default slot count", () => {
    const settings = withStreamerViewSettingsDefaults({});

    expect(settings.visibleSections?.statsHighlightSlots).toHaveLength(INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);
  });
});
