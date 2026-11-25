import { describe, expect, it } from "vitest";
import { parseSettingsFromUrl } from "../../live-tracker/settings/settings-url-params";
import { DEFAULT_ALL_SETTINGS } from "../../live-tracker/settings/types";
import type { AllStreamerSettings } from "../../live-tracker/settings/types";
import { buildArchiveOverlayUrl } from "../archive-overlay-url";

describe("buildArchiveOverlayUrl", () => {
  it("keeps the archive URL identity and hash while serializing applied overlay settings", () => {
    const settings: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_ALL_SETTINGS.global,
        viewPreview: true,
        fontSizes: {
          ...DEFAULT_ALL_SETTINGS.global.fontSizes,
          score: 110,
          teams: 90,
        },
        colors: {
          ...DEFAULT_ALL_SETTINGS.global.colors,
          mode: "player",
          observerView: { eagleColor: "jade", cobraColor: "sky" },
          playerView: { selectedPlayerId: "player-1", teamColor: "red", enemyColor: "blue" },
        },
        display: {
          ...DEFAULT_ALL_SETTINGS.global.display,
          showDiscordNames: false,
          showXboxNames: false,
          showServerIcon: false,
          showScore: false,
        },
        ticker: {
          ...DEFAULT_ALL_SETTINGS.global.ticker,
          showTicker: false,
          showPreSeriesInfo: false,
          selectedSlayerStats: [],
          medalRarityFilter: [],
        },
      },
      series: {
        ...DEFAULT_ALL_SETTINGS.series,
        titleOverride: "Finals",
        eagleTeamNameOverride: "Blue Team",
      },
    };

    const result = new URL(
      buildArchiveOverlayUrl(
        "https://example.test/stats/discord/guild/queue?campaign=summer#match-one",
        settings,
        true,
      ),
    );
    const parsed = parseSettingsFromUrl(result.searchParams, {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_ALL_SETTINGS.global,
        viewPreview: true,
        display: { ...DEFAULT_ALL_SETTINGS.global.display, showServerIcon: true },
        fontSizes: {
          ...DEFAULT_ALL_SETTINGS.global.fontSizes,
          score: 80,
          teams: 120,
        },
      },
    });

    expect(result.pathname).toBe("/stats/discord/guild/queue");
    expect(result.searchParams.get("campaign")).toBe("summer");
    expect(result.hash).toBe("#match-one");
    expect(result.searchParams.get("viewMode")).toBe("streamer");
    expect(parsed.global.viewPreview).toBe(false);
    expect(parsed.global.display.showScore).toBe(false);
    expect(parsed.global.display.showServerIcon).toBe(false);
    expect(parsed.global.display.showXboxNames).toBe(false);
    expect(parsed.global.fontSizes.score).toBe(110);
    expect(parsed.global.fontSizes.teams).toBe(90);
    expect(parsed.global.colors.observerView).toEqual({ eagleColor: "jade", cobraColor: "sky" });
    expect(parsed.global.ticker.selectedSlayerStats).toEqual([]);
    expect(parsed.global.ticker.medalRarityFilter).toEqual([]);
    expect(parsed.series.titleOverride).toBe("Finals");
    expect(parsed.series.eagleTeamNameOverride).toBe("Blue Team");
    expect(result.searchParams.has("showPreSeriesInfo")).toBe(false);
    expect(result.searchParams.has("colorMode")).toBe(false);
    expect(result.searchParams.has("selectedPlayerId")).toBe(false);
  });

  it("does not export team customization when stable team slots are unavailable", () => {
    const result = new URL(
      buildArchiveOverlayUrl(
        "https://example.test/archive?keep=yes&eagleColor=jade&cobraColor=sky&eagleTeamName=Old",
        DEFAULT_ALL_SETTINGS,
        false,
      ),
    );

    expect(result.searchParams.get("showTeamDetails")).toBe("false");
    expect(result.searchParams.has("eagleColor")).toBe(false);
    expect(result.searchParams.has("cobraColor")).toBe(false);
    expect(result.searchParams.has("eagleTeamName")).toBe(false);
    expect(result.searchParams.has("showXboxNames")).toBe(false);
    expect(result.searchParams.has("eagleTeamName")).toBe(false);
    expect(result.searchParams.get("keep")).toBe("yes");
  });
});
