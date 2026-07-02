import { describe, expect, it } from "vitest";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { gameModeIconSrc } from "../../game-mode-icon";
import type {
  IndividualTrackerViewerRenderModel,
  ViewerMatchTab,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "../../viewer/types";
import { IndividualTrackerOverlayPresenter } from "../individual-tracker-overlay-presenter";

function aRenderModelWith(
  overrides: Partial<IndividualTrackerViewerRenderModel> = {},
): IndividualTrackerViewerRenderModel {
  return {
    trackerId: "tracker-1",
    gamertag: "TrackedPlayer",
    status: "active",
    isLive: true,
    hasActiveSeries: false,
    activeSeriesContext: undefined,
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    timeline: [],
    accumulated: { total: 0, wins: 0, losses: 0, ties: 0 },
    statsHighlights: undefined,
    teamColors: [
      { id: "eagle", name: "Eagle", hex: "#0066CC" },
      { id: "cobra", name: "Cobra", hex: "#CC0000" },
    ],
    ...overrides,
  };
}

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
    teams: overrides.teams ?? [],
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
  const presenter = new IndividualTrackerOverlayPresenter();

  it("finds the active series in timeline", () => {
    const timeline: ViewerTimelineItem[] = [
      { type: "series", series: aSeriesWith({ id: "series-old", isActive: false }) },
      { type: "match", match: aMatchWith({ matchId: "solo" }) },
      { type: "series", series: aSeriesWith({ id: "series-active", isActive: true }) },
    ];

    const activeSeries = presenter.getActiveSeries(timeline);
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

    const tabs = presenter.buildTabs(timeline);

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

    const tabs = presenter.buildTabs(timeline);

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

    const tabs = presenter.buildTabs(timeline);
    const seriesTabs = tabs.filter((tab) => tab.type === "series");

    expect(seriesTabs).toHaveLength(2);
    if (seriesTabs.length === 2) {
      expect(seriesTabs[0].index).toBe(-1);
      expect(seriesTabs[1].index).toBe(-2);
    }
  });

  it("returns a series score tab when active series exists but has no matches", () => {
    const activeSeries = aSeriesWith({
      id: "series-active",
      isActive: true,
      score: "0:0",
      matches: [],
    });

    const tabs = presenter.buildTabs([], activeSeries);

    expect(tabs).toHaveLength(1);
    const [seriesTab] = tabs;
    expect(seriesTab.type).toBe("series");
    if (seriesTab.type === "series") {
      expect(seriesTab.label).toBe("Series score");
      expect(seriesTab.score).toBe("0:0");
      expect(seriesTab.index).toBe(-1);
    }
  });

  it("builds pre-series ticker group only when ticker is enabled and active series has no matches", () => {
    const groups = presenter.buildPreSeriesTickerGroup({
      showTicker: true,
      activeSeries: aSeriesWith({ matches: [], isActive: true }),
      playerName: "TrackedPlayer",
      discordName: null,
      gamertag: "TrackedPlayer",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Player Info");
    expect(groups[0].rows[0].showTeamIcon).toBe(false);
    expect(groups[0].rows[0].gamertag).toBe("TrackedPlayer");
  });

  it("builds top-section team details with xbox-only names when discord names are hidden", () => {
    const model = presenter.present({
      renderModel: aRenderModelWith({
        timeline: [
          {
            type: "series",
            series: aSeriesWith({
              isActive: true,
              teams: [
                { id: 0, name: "Alpha", players: [{ discordName: "DiscordAlpha", gamertag: "XboxAlpha" }] },
                { id: 1, name: "Beta", players: [{ discordName: "DiscordBeta", gamertag: "XboxBeta" }] },
              ],
            }),
          },
        ],
      }),
      streamerSettings: {
        visibleSections: {
          showDiscordNames: false,
          showXboxNames: true,
        },
      } satisfies StreamerViewSettings,
      matchStatsState: null,
      selectedMatchId: null,
    });

    expect(model.topSection?.teamLeft?.players).toEqual([{ key: "DiscordAlpha:XboxAlpha", label: "XboxAlpha" }]);
    expect(model.topSection?.teamRight?.players).toEqual([{ key: "DiscordBeta:XboxBeta", label: "XboxBeta" }]);
  });

  it("omits player rows entirely when both discord and xbox names are hidden", () => {
    const model = presenter.present({
      renderModel: aRenderModelWith({
        timeline: [
          {
            type: "series",
            series: aSeriesWith({
              isActive: true,
              teams: [
                { id: 0, name: "Alpha", players: [{ discordName: "DiscordAlpha", gamertag: "XboxAlpha" }] },
                { id: 1, name: "Beta", players: [{ discordName: "DiscordBeta", gamertag: "XboxBeta" }] },
              ],
            }),
          },
        ],
      }),
      streamerSettings: {
        visibleSections: {
          showDiscordNames: false,
          showXboxNames: false,
        },
      } satisfies StreamerViewSettings,
      matchStatsState: null,
      selectedMatchId: null,
    });

    expect(model.topSection?.teamLeft?.players).toEqual([]);
    expect(model.topSection?.teamRight?.players).toEqual([]);
  });

  it("deduplicates top-section player keys when display names repeat", () => {
    const model = presenter.present({
      renderModel: aRenderModelWith({
        timeline: [
          {
            type: "series",
            series: aSeriesWith({
              isActive: true,
              teams: [
                {
                  id: 0,
                  name: "Alpha",
                  players: [
                    { discordName: "Same", gamertag: "Tag" },
                    { discordName: "Same", gamertag: "Tag" },
                  ],
                },
                {
                  id: 1,
                  name: "Beta",
                  players: [{ discordName: "Other", gamertag: "OtherTag" }],
                },
              ],
            }),
          },
        ],
      }),
      streamerSettings: undefined,
      matchStatsState: null,
      selectedMatchId: null,
    });

    expect(model.topSection?.teamLeft?.players).toEqual([
      { key: "Same:Tag", label: "Same" },
      { key: "Same:Tag:1", label: "Same" },
    ]);
  });
});
