import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { Services } from "../../../../services/types";
import { aFakeAuthServiceWith } from "../../../../services/auth/fakes/auth.fake";
import { aFakeLiveTrackerServiceWith } from "../../../../services/live-tracker/fakes/live-tracker.fake";
import {
  FakeIndividualTrackerService,
  aFakeIndividualTrackerServiceWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { ActiveTrackerViewResponse } from "../../../../services/individual-tracker/types";
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_TICKER_SETTINGS } from "../../../streamer-settings/shared-types";
import type { OverlayTickerGroup, IndividualTrackerViewerRenderModel } from "../../types";
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
) => readonly OverlayTickerGroup[] {
  const value: unknown = Reflect.get(presenter, "computeOverlayTickerGroups");
  if (typeof value !== "function") {
    throw new Error("computeOverlayTickerGroups is not available");
  }

  return (renderModel: IndividualTrackerViewerRenderModel, settings: OverlaySettingsForTicker) => {
    const result: unknown = value.call(presenter, renderModel, settings);
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

function getTickerGroups(
  presenter: PublicViewerPresenter,
  renderModel: IndividualTrackerViewerRenderModel,
  settings: OverlaySettingsForTicker,
): readonly OverlayTickerGroup[] {
  const computeOverlayTickerGroups = getPrivateComputeOverlayTickerGroups(presenter);
  return computeOverlayTickerGroups(renderModel, settings);
}

describe("PublicViewerPresenter", () => {
  it("filters ticker stats and medals using server-side ticker settings", () => {
    const presenter = createPresenter();
    const renderModel = createRenderModel();

    const groups = getTickerGroups(presenter, renderModel, createSettings());

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
    );

    const teamRow = groups[0].rows.find((row) => row.type === "team");
    const playerRow = groups[0].rows.find((row) => row.type === "player");

    expect(teamRow?.stats.map((stat) => stat.name)).toEqual(["Kills", "Ball time"]);
    expect(playerRow?.stats.map((stat) => stat.name)).toEqual(["Kills", "Ball time"]);
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
