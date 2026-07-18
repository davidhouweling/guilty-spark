import { describe, expect, it } from "vitest";
import {
  DEFAULT_STREAMER_VIEW_SETTINGS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  parseStreamerViewSettings,
  withStreamerViewSettingsDefaults,
} from "../streamer-view-settings";

describe("DEFAULT_STREAMER_VIEW_SETTINGS", () => {
  it("uses the default stats highlight slot count", () => {
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.visibleSections?.statsHighlightSlots).toHaveLength(
      INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
    );
  });

  it("includes defaults for recently added history settings", () => {
    expect(DEFAULT_STREAMER_VIEW_SETTINGS.visibleSections?.maxPreviousGamesToShow).toBe(9);
  });
});

describe("withStreamerViewSettingsDefaults()", () => {
  it("fills missing stats highlight slots using the default slot count", () => {
    const settings = withStreamerViewSettingsDefaults({});

    expect(settings.visibleSections?.statsHighlightSlots).toHaveLength(INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);
  });

  it("fills missing recently added history settings", () => {
    const settings = withStreamerViewSettingsDefaults({});

    expect(settings.visibleSections?.maxPreviousGamesToShow).toBe(9);
  });

  it("preserves legacy showTabs when per-state tab toggles are missing", () => {
    const settings = withStreamerViewSettingsDefaults({
      visibleSections: {
        showTabs: false,
      },
    });

    expect(settings.visibleSections?.showTabs).toBe(false);
    expect(settings.styleFlags?.inSeriesShowTabs).toBeUndefined();
    expect(settings.styleFlags?.matchmakingShowTabs).toBeUndefined();
  });
});

describe("parseStreamerViewSettings()", () => {
  it("drops invalid maxPreviousGamesToShow while preserving other visibleSections settings", () => {
    const settings = parseStreamerViewSettings({
      StyleFlagsJson: "{}",
      VisibleSectionsJson: JSON.stringify({
        showTabs: false,
        maxPreviousGamesToShow: 99,
      }),
      LayoutOptionsJson: "{}",
    });

    expect(settings.visibleSections?.showTabs).toBe(false);
    expect(settings.visibleSections?.maxPreviousGamesToShow).toBeUndefined();
  });

  it("keeps valid maxPreviousGamesToShow values", () => {
    const settings = parseStreamerViewSettings({
      StyleFlagsJson: "{}",
      VisibleSectionsJson: JSON.stringify({
        maxPreviousGamesToShow: 12,
      }),
      LayoutOptionsJson: "{}",
    });

    expect(settings.visibleSections?.maxPreviousGamesToShow).toBe(12);
  });
});
