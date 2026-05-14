import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { Services } from "../../../../services/types";
import { aFakeAuthServiceWith } from "../../../../services/auth/fakes/auth.fake";
import { aFakeLiveTrackerServiceWith } from "../../../../services/live-tracker/fakes/live-tracker.fake";
import {
  FakeIndividualTrackerService,
  aFakeIndividualTrackerServiceWith,
  aFakeIndividualTrackerStateWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { ActiveTrackerViewResponse } from "../../../../services/individual-tracker/types";
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_TICKER_SETTINGS } from "../../../streamer-settings/shared-types";
import type {
  OverlayTickerGroup,
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerMatchCard,
  IndividualTrackerViewerSeriesTotals,
} from "../../types";
import type { PublicViewerOverlaySharedTab, PublicViewerSnapshot } from "../types";
import { PublicViewerStore } from "../public-viewer-store";
import { PublicViewerPresenter } from "../public-viewer-presenter";
import {
  aFakeMatchStatsDataWith,
  aFakeMatchStatsMedalWith,
  aFakeMatchStatsPlayerDataWith,
  aFakeMatchStatsValuesWith,
} from "../../../stats/fakes/component-data";

interface OverlaySettingsForTicker {
  readonly showMatchmakingStatsOnly: boolean;
  readonly selectedSlayerStats: readonly string[];
  readonly showObjectiveStats: boolean;
  readonly medalRarityFilter: readonly number[];
}

interface ExtractedOverlaySettings {
  readonly showMatchmakingStatsOnly: boolean;
  readonly selectedSlayerStats: readonly string[];
  readonly showObjectiveStats: boolean;
  readonly medalRarityFilter: readonly number[];
  readonly showPreSeriesInfo: boolean;
}

interface TickerOverlayContext {
  readonly hasSeriesContext: boolean;
  readonly seriesMatches: readonly IndividualTrackerViewerMatchCard[];
  readonly seriesTotals: IndividualTrackerViewerSeriesTotals | null;
  readonly timelineTabIndexes: readonly number[];
}

class ActiveViewIndividualTrackerService extends FakeIndividualTrackerService {
  private readonly activeViewResponse: ActiveTrackerViewResponse;

  public constructor(activeViewResponse: ActiveTrackerViewResponse) {
    super({ activeState: activeViewResponse.activeTracker });
    this.activeViewResponse = activeViewResponse;
  }

  public override async getActiveTrackerView(xuid: string): Promise<ActiveTrackerViewResponse> {
    void xuid;
    return Promise.resolve(this.activeViewResponse);
  }
}

function createServices(individualTrackerService: Services["individualTrackerService"]): Services {
  return {
    authService: aFakeAuthServiceWith(),
    liveTrackerService: aFakeLiveTrackerServiceWith(),
    individualTrackerService,
  };
}

function createPresenter(individualTrackerService = aFakeIndividualTrackerServiceWith()): PublicViewerPresenter {
  const store = new PublicViewerStore("xuid-1", "overlay");

  return new PublicViewerPresenter({
    services: createServices(individualTrackerService),
    store,
    xuid: "xuid-1",
    variant: "overlay",
  });
}

function createRenderModel(): IndividualTrackerViewerRenderModel {
  return {
    lastUpdatedTime: "2026-05-13T00:00:00.000Z",
    trackerStatus: "active",
    accumulatedStats: {
      total: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      customOrLocal: 0,
      matchmaking: 1,
      groupedSeries: 0,
      standalone: 1,
    },
    teamColors: [],
    activeNeatQueueSeries: null,
    trackedPlayerTotals: null,
    trackedEntriesCount: 1,
    gameplayTimeline: [
      {
        type: "match",
        id: "match-1",
        match: {
          id: "match-1",
          matchStats: [
            aFakeMatchStatsDataWith({
              teamId: 0,
              teamStats: [
                aFakeMatchStatsValuesWith({ name: "Kills", value: 20, display: "20" }),
                aFakeMatchStatsValuesWith({ name: "Ball time", value: 52, display: "0:52" }),
              ],
              players: [
                aFakeMatchStatsPlayerDataWith({
                  name: "Alpha",
                  values: [
                    aFakeMatchStatsValuesWith({ name: "Kills", value: 11, display: "11" }),
                    aFakeMatchStatsValuesWith({ name: "Ball time", value: 18, display: "0:18" }),
                  ],
                  medals: [
                    aFakeMatchStatsMedalWith({ name: "Common", sortingWeight: 80 }),
                    aFakeMatchStatsMedalWith({ name: "Legendary", sortingWeight: 160 }),
                  ],
                }),
              ],
              teamMedals: [
                aFakeMatchStatsMedalWith({ name: "Heroic", sortingWeight: 120 }),
                aFakeMatchStatsMedalWith({ name: "Mythic", sortingWeight: 220 }),
              ],
            }),
          ],
          backgroundImageUrl: "https://example.com/background.png",
          gameVariantCategory: GameVariantCategory.MultiplayerOddball,
          gameMode: "Oddball",
          matchNumber: 1,
          gameTypeAndMap: "Oddball on Live Fire",
          map: "Live Fire",
          duration: "12:00",
          score: "100:90",
          startTime: "2026-05-13T00:00:00.000Z",
          endTime: "2026-05-13T00:12:00.000Z",
        },
      },
    ],
  };
}

function createSettings(overrides: Partial<OverlaySettingsForTicker> = {}): OverlaySettingsForTicker {
  return {
    showMatchmakingStatsOnly: false,
    selectedSlayerStats: ["Kills"],
    showObjectiveStats: false,
    medalRarityFilter: [2],
    ...overrides,
  };
}

function isOverlayTickerGroups(value: unknown): value is readonly OverlayTickerGroup[] {
  return Array.isArray(value);
}

function isExtractedOverlaySettings(value: unknown): value is ExtractedOverlaySettings {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  return (
    typeof Reflect.get(value, "showMatchmakingStatsOnly") === "boolean" &&
    Array.isArray(Reflect.get(value, "selectedSlayerStats")) &&
    Array.isArray(Reflect.get(value, "medalRarityFilter")) &&
    typeof Reflect.get(value, "showObjectiveStats") === "boolean" &&
    typeof Reflect.get(value, "showPreSeriesInfo") === "boolean"
  );
}

function getPrivateComputeOverlayTickerGroups(
  presenter: PublicViewerPresenter,
): (
  renderModel: IndividualTrackerViewerRenderModel,
  settings: OverlaySettingsForTicker,
  context: TickerOverlayContext,
) => readonly OverlayTickerGroup[] {
  const value: unknown = Reflect.get(presenter, "computeOverlayTickerGroups");
  if (typeof value !== "function") {
    throw new Error("computeOverlayTickerGroups is not available");
  }

  return (
    renderModel: IndividualTrackerViewerRenderModel,
    settings: OverlaySettingsForTicker,
    context: TickerOverlayContext,
  ) => {
    const result: unknown = value.call(presenter, renderModel, settings, context);
    if (!isOverlayTickerGroups(result)) {
      throw new Error("computeOverlayTickerGroups returned an invalid payload");
    }

    return result;
  };
}

function getPrivateExtractOverlaySettings(presenter: PublicViewerPresenter): () => ExtractedOverlaySettings {
  const value: unknown = Reflect.get(presenter, "extractOverlaySettings");
  if (typeof value !== "function") {
    throw new Error("extractOverlaySettings is not available");
  }

  return () => {
    const result: unknown = value.call(presenter);
    if (!isExtractedOverlaySettings(result)) {
      throw new Error("extractOverlaySettings returned an invalid payload");
    }

    return result;
  };
}

function getPrivateResolveOverlayContext(
  presenter: PublicViewerPresenter,
): (
  snapshot: PublicViewerSnapshot,
  renderModel: IndividualTrackerViewerRenderModel,
  overlayTabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: "group" | "standalone" | "active-series";
    readonly teamColor: string | undefined;
    readonly timelineIndex?: number | undefined;
  }[],
  overlayAccumulatedStats: {
    readonly wins: number;
    readonly losses: number;
    readonly total: number;
    readonly matchmaking: number;
    readonly custom: number;
  },
) => { readonly sharedTabs: readonly PublicViewerOverlaySharedTab[] } {
  const value: unknown = Reflect.get(presenter, "resolveOverlayContext");
  if (typeof value !== "function") {
    throw new Error("resolveOverlayContext is not available");
  }

  return (
    snapshot: PublicViewerSnapshot,
    renderModel: IndividualTrackerViewerRenderModel,
    overlayTabs,
    overlayAccumulatedStats,
  ) => {
    const result: unknown = value.call(presenter, snapshot, renderModel, overlayTabs, overlayAccumulatedStats);
    if (typeof result !== "object" || result == null || !Array.isArray(Reflect.get(result, "sharedTabs"))) {
      throw new Error("resolveOverlayContext returned an invalid payload");
    }

    return result as { readonly sharedTabs: readonly PublicViewerOverlaySharedTab[] };
  };
}

function setPrivateStreamerVisibleSections(presenter: PublicViewerPresenter, value: Record<string, unknown>): void {
  Reflect.set(presenter, "streamerVisibleSections", value);
}

async function waitForPresenterToSettle(presenter: PublicViewerPresenter): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!presenter.getSnapshot().loading) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error("Presenter did not settle");
}

function createNonSeriesContext(renderModel: IndividualTrackerViewerRenderModel): TickerOverlayContext {
  const timelineTabIndexes = renderModel.gameplayTimeline.flatMap((item, index) =>
    item.type === "match" ? [index] : [],
  );

  return {
    hasSeriesContext: false,
    seriesMatches: [],
    seriesTotals: null,
    timelineTabIndexes,
  };
}

function aFakeMatchCard(
  id: string,
  label: string,
  matchStats: IndividualTrackerViewerMatchCard["matchStats"] = null,
): IndividualTrackerViewerMatchCard {
  return {
    id,
    matchStats,
    backgroundImageUrl: "",
    gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
    gameMode: "Slayer",
    matchNumber: 1,
    gameTypeAndMap: label,
    map: "Aquarius",
    duration: "10:00",
    score: "50:48",
    startTime: "2026-05-14T00:00:00.000Z",
    endTime: "2026-05-14T00:10:00.000Z",
  };
}

function getTickerGroups(
  presenter: PublicViewerPresenter,
  renderModel: IndividualTrackerViewerRenderModel,
  settings: OverlaySettingsForTicker,
  context: TickerOverlayContext,
): readonly OverlayTickerGroup[] {
  const computeOverlayTickerGroups = getPrivateComputeOverlayTickerGroups(presenter);
  return computeOverlayTickerGroups(renderModel, settings, context);
}

describe("PublicViewerPresenter", () => {
  it("filters ticker stats and medals using server-side ticker settings", () => {
    const presenter = createPresenter();
    const renderModel = createRenderModel();

    const groups = getTickerGroups(presenter, renderModel, createSettings(), createNonSeriesContext(renderModel));

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Oddball on Live Fire");

    const teamRow = groups[0].rows.find((row) => row.type === "team");
    const playerRow = groups[0].rows.find((row) => row.type === "player");

    expect(teamRow?.stats.map((stat) => stat.name)).toEqual(["Kills"]);
    expect(playerRow?.stats.map((stat) => stat.name)).toEqual(["Kills"]);

    expect(teamRow?.medals.map((medal) => medal.name)).toEqual([]);
    expect(playerRow?.medals.map((medal) => medal.name)).toEqual(["Legendary"]);
  });

  it("includes objective stats when showObjectiveStats is enabled", () => {
    const presenter = createPresenter();
    const renderModel = createRenderModel();

    const groups = getTickerGroups(
      presenter,
      renderModel,
      createSettings({
        showObjectiveStats: true,
        medalRarityFilter: [0, 1, 2, 3],
      }),
      createNonSeriesContext(renderModel),
    );

    const teamRow = groups[0].rows.find((row) => row.type === "team");
    const playerRow = groups[0].rows.find((row) => row.type === "player");

    expect(teamRow?.stats.map((stat) => stat.name)).toEqual(["Kills", "Ball time"]);
    expect(playerRow?.stats.map((stat) => stat.name)).toEqual(["Kills", "Ball time"]);
  });

  it("in non-series context restricts groups to timelineTabIndexes and uses sequential matchIndex", () => {
    const presenter = createPresenter();
    const matchStats = [
      aFakeMatchStatsDataWith({
        teamId: 0,
        teamStats: [aFakeMatchStatsValuesWith({ name: "Kills", value: 10, display: "10" })],
        players: [],
        teamMedals: [],
      }),
    ];

    const renderModel: IndividualTrackerViewerRenderModel = {
      ...createRenderModel(),
      gameplayTimeline: [
        { type: "match", id: "match-a", match: aFakeMatchCard("match-a", "Match A", matchStats) },
        { type: "match", id: "match-b", match: aFakeMatchCard("match-b", "Match B", matchStats) },
        { type: "match", id: "match-c", match: aFakeMatchCard("match-c", "Match C", matchStats) },
      ],
    };

    // Only tabs for timeline indexes 0 and 2 are shown (index 1 is hidden)
    const context: TickerOverlayContext = {
      hasSeriesContext: false,
      seriesMatches: [],
      seriesTotals: null,
      timelineTabIndexes: [0, 2],
    };

    const groups = getTickerGroups(presenter, renderModel, createSettings({ selectedSlayerStats: ["Kills"] }), context);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Match A");
    expect(groups[0].matchIndex).toBe(0);
    expect(groups[1].label).toBe("Match C");
    expect(groups[1].matchIndex).toBe(1); // sequential tab position 1, not timeline index 2
  });

  it("in series context only shows series matches and excludes pre-series timeline matches", () => {
    const presenter = createPresenter();
    const matchStats = [
      aFakeMatchStatsDataWith({
        teamId: 0,
        teamStats: [aFakeMatchStatsValuesWith({ name: "Kills", value: 10, display: "10" })],
        players: [],
        teamMedals: [],
      }),
    ];

    // Render model has a pre-series match in the timeline
    const renderModel: IndividualTrackerViewerRenderModel = {
      ...createRenderModel(),
      gameplayTimeline: [
        {
          type: "match",
          id: "pre-series-match",
          match: aFakeMatchCard("pre-series-match", "Pre-Series Match", matchStats),
        },
      ],
    };

    // Series context references its own matches (not the timeline)
    const context: TickerOverlayContext = {
      hasSeriesContext: true,
      seriesMatches: [
        aFakeMatchCard("series-match-1", "Series Match 1", matchStats),
        aFakeMatchCard("series-match-2", "Series Match 2", matchStats),
      ],
      seriesTotals: null,
      timelineTabIndexes: [],
    };

    const groups = getTickerGroups(presenter, renderModel, createSettings({ selectedSlayerStats: ["Kills"] }), context);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.label !== "Pre-Series Match")).toBe(true);
    expect(groups[0].label).toBe("Series Match 1");
    expect(groups[0].matchIndex).toBe(0);
    expect(groups[1].label).toBe("Series Match 2");
    expect(groups[1].matchIndex).toBe(1);
  });

  it("in series context adds Series Stats group at matchIndex -1 from seriesTotals", () => {
    const presenter = createPresenter();
    const seriesTotals: IndividualTrackerViewerSeriesTotals = {
      teamData: [
        aFakeMatchStatsDataWith({
          teamId: 0,
          teamStats: [aFakeMatchStatsValuesWith({ name: "Kills", value: 30, display: "30" })],
          players: [
            aFakeMatchStatsPlayerDataWith({
              name: "Alpha",
              values: [aFakeMatchStatsValuesWith({ name: "Kills", value: 15, display: "15" })],
              medals: [],
            }),
          ],
          teamMedals: [],
        }),
      ],
      playerData: [],
      metadata: null,
    };

    const context: TickerOverlayContext = {
      hasSeriesContext: true,
      seriesMatches: [],
      seriesTotals,
      timelineTabIndexes: [],
    };

    const groups = getTickerGroups(
      presenter,
      createRenderModel(),
      createSettings({ selectedSlayerStats: ["Kills"] }),
      context,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].matchIndex).toBe(-1);
    expect(groups[0].label).toBe("Series Stats");

    const teamRow = groups[0].rows.find((row) => row.type === "team");
    expect.assertions(4);
    if (teamRow != null) {
      expect(teamRow.stats.map((s) => s.name)).toEqual(["Kills"]);
    }
  });

  it("returns no ticker groups when visible tabs resolve to timeline items without match stats", () => {
    const presenter = createPresenter();

    const renderModel: IndividualTrackerViewerRenderModel = {
      ...createRenderModel(),
      gameplayTimeline: [
        {
          type: "match",
          id: "match-empty-stats",
          match: aFakeMatchCard("match-empty-stats", "Match Empty", []),
        },
      ],
    };

    const context: TickerOverlayContext = {
      hasSeriesContext: false,
      seriesMatches: [],
      seriesTotals: null,
      timelineTabIndexes: [0],
    };

    const groups = getTickerGroups(presenter, renderModel, createSettings({ selectedSlayerStats: ["Kills"] }), context);

    expect(groups).toEqual([]);
  });

  it("formats recorded grouped-series tabs with deduped icons and series metadata", () => {
    expect.assertions(7);

    const presenter = createPresenter();
    const snapshot: PublicViewerSnapshot = {
      ...new PublicViewerStore("xuid-1", "overlay").snapshot,
      trackerState: aFakeIndividualTrackerStateWith({ gamertag: "Chief", status: "active" }),
      viewerTeamColor: "salmon",
      viewerEnemyColor: "cerulean",
    };

    const renderModel: IndividualTrackerViewerRenderModel = {
      ...createRenderModel(),
      gameplayTimeline: [
        {
          type: "group",
          id: "group-0",
          title: "Championship",
          subtitle: "Best of 5",
          seriesScore: "3:2",
          overviewMatches: [
            {
              id: "m1",
              gameMode: "Oddball",
              score: "100:90",
              mapName: "Streets",
              mapThumbnailUrl: "",
              winningTeamIndex: 0,
            },
            {
              id: "m2",
              gameMode: "Oddball",
              score: "100:80",
              mapName: "Streets",
              mapThumbnailUrl: "",
              winningTeamIndex: 0,
            },
            {
              id: "m3",
              gameMode: "Oddball",
              score: "100:70",
              mapName: "Streets",
              mapThumbnailUrl: "",
              winningTeamIndex: 0,
            },
            {
              id: "m4",
              gameMode: "Slayer",
              score: "50:45",
              mapName: "Aquarius",
              mapThumbnailUrl: "",
              winningTeamIndex: 1,
            },
            {
              id: "m5",
              gameMode: "Slayer",
              score: "50:48",
              mapName: "Aquarius",
              mapThumbnailUrl: "",
              winningTeamIndex: 1,
            },
          ],
          teams: [
            { id: "team-0", name: "Blue", colorHex: undefined, players: [{ id: "p-1", content: "Chief" }] },
            { id: "team-1", name: "Red", colorHex: undefined, players: [{ id: "p-2", content: "Opponent" }] },
          ],
          seriesTotals: null,
          matches: [
            {
              ...aFakeMatchCard("m1", "Oddball on Streets"),
              gameVariantCategory: GameVariantCategory.MultiplayerOddball,
              gameMode: "Oddball",
              map: "Streets",
            },
            {
              ...aFakeMatchCard("m2", "Oddball on Streets"),
              gameVariantCategory: GameVariantCategory.MultiplayerOddball,
              gameMode: "Oddball",
              map: "Streets",
            },
            {
              ...aFakeMatchCard("m3", "Oddball on Streets"),
              gameVariantCategory: GameVariantCategory.MultiplayerOddball,
              gameMode: "Oddball",
              map: "Streets",
            },
            {
              ...aFakeMatchCard("m4", "Slayer on Aquarius"),
              gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
              gameMode: "Slayer",
              map: "Aquarius",
            },
            {
              ...aFakeMatchCard("m5", "Slayer on Aquarius"),
              gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
              gameMode: "Slayer",
              map: "Aquarius",
            },
          ],
        },
        {
          type: "match",
          id: "standalone-1",
          match: aFakeMatchCard("standalone-1", "Slayer on Live Fire"),
        },
      ],
    };

    const overlayTabs = [
      {
        id: "group-0",
        label: "Set 1",
        type: "group" as const,
        teamColor: "#FE3939",
        timelineIndex: 0,
      },
      {
        id: "standalone-1",
        label: "Live Fire",
        type: "standalone" as const,
        teamColor: "#FE3939",
        timelineIndex: 1,
      },
    ];

    const resolveOverlayContext = getPrivateResolveOverlayContext(presenter);
    const resolved = resolveOverlayContext(snapshot, renderModel, overlayTabs, {
      wins: 0,
      losses: 0,
      total: 0,
      matchmaking: 0,
      custom: 0,
    });

    const [, groupedTab] = resolved.sharedTabs;

    expect(groupedTab.type).toBe("match");
    if (groupedTab.type !== "match") {
      throw new Error("Expected grouped match tab to be present");
    }

    expect(groupedTab.label).toBe("Championship Best of 5");
    expect(groupedTab.score).toBe("3:2");
    expect(groupedTab.icons).toHaveLength(2);
    const [firstIcon, secondIcon] = groupedTab.icons ?? [];
    expect(firstIcon.dimmed).toBe(false);
    expect(secondIcon.dimmed).toBe(true);
    expect(groupedTab.icon).toBe("");
  });

  it("extracts overlay ticker settings from visible sections", () => {
    const presenter = createPresenter();

    setPrivateStreamerVisibleSections(presenter, {
      showMatchmakingStatsOnly: true,
      selectedSlayerStats: ["Score", "Kills"],
      showObjectiveStats: true,
      medalRarityFilter: [1, 3],
      showPreSeriesInfo: false,
    });

    const settings = getPrivateExtractOverlaySettings(presenter)();

    expect(settings.showMatchmakingStatsOnly).toBe(true);
    expect(settings.selectedSlayerStats).toEqual(["Score", "Kills"]);
    expect(settings.showObjectiveStats).toBe(true);
    expect(settings.medalRarityFilter).toEqual([1, 3]);
    expect(settings.showPreSeriesInfo).toBe(false);
  });

  it("falls back to default ticker settings for invalid visible section values", () => {
    const presenter = createPresenter();

    setPrivateStreamerVisibleSections(presenter, {
      selectedSlayerStats: ["Kills", 2],
      medalRarityFilter: [2, "invalid"],
      showObjectiveStats: "yes",
      showPreSeriesInfo: "no",
    });

    const settings = getPrivateExtractOverlaySettings(presenter)();

    expect(settings.selectedSlayerStats).toEqual(DEFAULT_TICKER_SETTINGS.selectedSlayerStats);
    expect(settings.medalRarityFilter).toEqual(DEFAULT_TICKER_SETTINGS.medalRarityFilter);
    expect(settings.showObjectiveStats).toBe(DEFAULT_TICKER_SETTINGS.showObjectiveStats);
    expect(settings.showPreSeriesInfo).toBe(DEFAULT_TICKER_SETTINGS.showPreSeriesInfo);
  });

  it("applies server overlay settings to snapshot after start", async () => {
    const individualTrackerService = new ActiveViewIndividualTrackerService({
      status: "offline",
      activeTracker: null,
      streamerView: {
        profileId: "profile-1",
        layoutOptions: {},
        visibleSections: {
          showTabs: false,
          showTicker: false,
          showTeamDetails: false,
          showDiscordNames: false,
          showXboxNames: false,
          showTitle: false,
          showSubtitle: false,
          showScore: false,
          selectedSlayerStats: ["Score", "Kills"],
          showObjectiveStats: true,
          medalRarityFilter: [1, 3],
          showPreSeriesInfo: false,
          topBarStatSlots: DEFAULT_DISPLAY_SETTINGS.topBarStatSlots,
        },
        styleFlags: {},
        effectiveDefaults: {
          colorMode: "observer",
        },
        updatedAt: null,
      },
    });
    const presenter = createPresenter(individualTrackerService);

    presenter.start();
    await waitForPresenterToSettle(presenter);

    const snapshot = presenter.getSnapshot();

    expect(snapshot.overlayShowTabs).toBe(false);
    expect(snapshot.overlayShowTicker).toBe(false);
    expect(snapshot.overlayShowTeamDetails).toBe(false);
    expect(snapshot.overlayShowDiscordNames).toBe(false);
    expect(snapshot.overlayShowXboxNames).toBe(false);
    expect(snapshot.overlayShowTitle).toBe(false);
    expect(snapshot.overlayShowSubtitle).toBe(false);
    expect(snapshot.overlayShowScore).toBe(false);
    expect(snapshot.overlaySelectedSlayerStats).toEqual(["Score", "Kills"]);
    expect(snapshot.overlayShowObjectiveStats).toBe(true);
    expect(snapshot.overlayMedalRarityFilter).toEqual([1, 3]);
    expect(snapshot.overlayShowPreSeriesInfo).toBe(false);
    expect(snapshot.overlayTopBarStatSlots).toEqual(DEFAULT_DISPLAY_SETTINGS.topBarStatSlots);

    presenter.dispose();
  });
});
