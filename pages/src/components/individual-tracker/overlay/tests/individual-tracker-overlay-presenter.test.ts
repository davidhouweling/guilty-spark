import { describe, expect, it } from "vitest";
import { gameModeIconSrc } from "../../game-mode-icon";
import type { ViewerMatchTab, ViewerSeriesTab, ViewerTimelineItem } from "../../viewer/types";
import { buildTabs, getActiveSeries } from "../individual-tracker-overlay-presenter";

function aMatchWith(overrides: Partial<ViewerMatchTab> = {}): ViewerMatchTab {
  return {
    matchId: overrides.matchId ?? "match-1",
    mapName: overrides.mapName ?? "Live Fire",
    mapBackgroundUrl: overrides.mapBackgroundUrl ?? "data:,",
    gameVariantCategory: overrides.gameVariantCategory ?? 6,
    gameModeName: overrides.gameModeName ?? "Slayer",
    duration: overrides.duration ?? "10m",
    outcome: overrides.outcome ?? "Win",
    score: overrides.score ?? "50:42",
    colorHex: overrides.colorHex,
    startTime: overrides.startTime ?? "2026-01-01T00:00:00.000Z",
    endTime: overrides.endTime ?? "2026-01-01T00:10:00.000Z",
  };
}

function aSeriesWith(overrides: Partial<ViewerSeriesTab> = {}): ViewerSeriesTab {
  const matches = overrides.matches ?? [
    aMatchWith({ matchId: "series-match-1" }),
    aMatchWith({ matchId: "series-match-2" }),
  ];

  return {
    id: overrides.id ?? "series-1",
    title: overrides.title ?? "Eagle vs Cobra",
    subtitle: overrides.subtitle ?? "Best of 3",
    isActive: overrides.isActive ?? false,
    matchBackgroundUrls: overrides.matchBackgroundUrls ?? matches.map(() => "data:,"),
    score: overrides.score ?? "2:1",
    duration: overrides.duration ?? "30m",
    startTime: overrides.startTime ?? "2026-01-01T00:00:00.000Z",
    endTime: overrides.endTime ?? "2026-01-01T00:30:00.000Z",
    matches,
    colorHex: overrides.colorHex,
  };
}

describe("individual-tracker-overlay-presenter", () => {
  it("finds the active series in timeline", () => {
    const timeline: ViewerTimelineItem[] = [
      { type: "series", series: aSeriesWith({ id: "series-old", isActive: false }) },
      { type: "match", match: aMatchWith({ matchId: "solo" }) },
      { type: "series", series: aSeriesWith({ id: "series-active", isActive: true }) },
    ];

    const activeSeries = getActiveSeries(timeline);
    expect(activeSeries?.id).toBe("series-active");
  });

  it("builds only active series match tabs when active series exists", () => {
    const activeSeries = aSeriesWith({
      id: "series-active",
      isActive: true,
      matches: [
        aMatchWith({ matchId: "a", gameVariantCategory: 6 }),
        aMatchWith({ matchId: "b", gameVariantCategory: 8 }),
      ],
    });
    const timeline: ViewerTimelineItem[] = [
      { type: "series", series: aSeriesWith({ id: "series-old", isActive: false }) },
      { type: "series", series: activeSeries },
      { type: "match", match: aMatchWith({ matchId: "outside-series" }) },
    ];

    const tabs = buildTabs(timeline);

    expect(tabs).toHaveLength(2);
    expect(tabs.every((tab) => tab.type === "match")).toBe(true);
    expect(tabs.map((tab) => (tab.type === "match" ? tab.matchId : "series"))).toEqual(["a", "b"]);
  });

  it("builds series-consolidated tabs with per-match mode icons when no active series", () => {
    const completedSeries = aSeriesWith({
      id: "series-complete",
      isActive: false,
      matches: [
        aMatchWith({ matchId: "s1", gameVariantCategory: 6 }),
        aMatchWith({ matchId: "s2", gameVariantCategory: 7 }),
      ],
    });
    const timeline: ViewerTimelineItem[] = [
      { type: "series", series: completedSeries },
      { type: "match", match: aMatchWith({ matchId: "solo", gameVariantCategory: 8 }) },
    ];

    const tabs = buildTabs(timeline);

    expect(tabs).toHaveLength(2);
    const [seriesTab, matchTab] = tabs;
    expect(seriesTab.type).toBe("series");
    if (seriesTab.type === "series") {
      expect(seriesTab.seriesId).toBe("series-complete");
      expect(seriesTab.icons).toEqual([
        { src: gameModeIconSrc(6), dimmed: false },
        { src: gameModeIconSrc(7), dimmed: false },
      ]);
    }

    expect(matchTab.type).toBe("match");
    if (matchTab.type === "match") {
      expect(matchTab.icon).toBe(gameModeIconSrc(8));
    }
  });

  it("assigns unique negative indices for each series tab", () => {
    const timeline: ViewerTimelineItem[] = [
      { type: "series", series: aSeriesWith({ id: "series-a", isActive: false }) },
      { type: "series", series: aSeriesWith({ id: "series-b", isActive: false }) },
      { type: "match", match: aMatchWith({ matchId: "solo" }) },
    ];

    const tabs = buildTabs(timeline);
    const seriesTabs = tabs.filter((tab) => tab.type === "series");

    expect(seriesTabs).toHaveLength(2);
    if (seriesTabs.length === 2) {
      expect(seriesTabs[0].index).toBe(-1);
      expect(seriesTabs[1].index).toBe(-2);
    }
  });
});
