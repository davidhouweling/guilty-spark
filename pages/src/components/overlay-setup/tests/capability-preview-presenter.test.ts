import { describe, expect, it, vi } from "vitest";
import { aFakeIndividualTrackerServiceWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../services/individual-tracker/fakes/view.fake";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { createFixtureCapabilityPreviewData } from "../capability-preview-data";
import { CapabilityPreviewPresenter } from "../capability-preview-presenter";
import { CapabilityPreviewStore } from "../capability-preview-store";

function aMatch(overrides: Partial<TrackerMatchHistoryEntry> = {}): TrackerMatchHistoryEntry {
  return {
    matchId: "match-1",
    startTime: "today",
    endTime: "today",
    mapAssetId: "map",
    mapVersionId: "version",
    modeAssetId: "mode",
    modeVersionId: "version",
    gameVariantCategory: 6,
    duration: "10 minutes",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "50 - 41",
    isMatchmaking: true,
    category: "matchmaking",
    teams: [],
    mapThumbnailUrl: "https://example.com/map.png",
    ...overrides,
  };
}

describe("CapabilityPreviewPresenter", () => {
  it("maps authenticated matchmaking and custom history into preview data", async () => {
    const service = aFakeIndividualTrackerServiceWith();
    vi.spyOn(service, "getTrackers").mockResolvedValue({ trackers: [], statuses: {} });
    const matchmaking = aMatch({ mapName: "Streets", resultString: "50 - 42" });
    const custom = aMatch({ category: "custom", isMatchmaking: false, mapName: "Recharge", resultString: "50 - 45" });
    vi.spyOn(service, "getMatchHistory")
      .mockResolvedValueOnce({ matches: [matchmaking], suggestedGroupings: [] })
      .mockResolvedValueOnce({ matches: [custom], suggestedGroupings: [] });
    const store = new CapabilityPreviewStore(createFixtureCapabilityPreviewData("ChiefSpartan"));
    const presenter = new CapabilityPreviewPresenter({
      individualTrackerService: service,
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      store,
    });

    presenter.load("ChiefSpartan", "xuid-1", false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSnapshot().status).toBe("loaded");
    expect(store.getSnapshot().data.matchmaking.map).toBe("Streets");
    expect(store.getSnapshot().data.series.matches[0]?.map).toBe("Recharge");
    expect(store.getSnapshot().data.viewer.matches[0]?.map).toBe("Recharge");
  });

  it("uses fixture data without fetching for the example identity", () => {
    const service = aFakeIndividualTrackerServiceWith();
    const getMatchHistory = vi.spyOn(service, "getMatchHistory");
    const store = new CapabilityPreviewStore(createFixtureCapabilityPreviewData("soundmanD"));
    const presenter = new CapabilityPreviewPresenter({
      individualTrackerService: service,
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      store,
    });

    presenter.load("soundmanD", null, true);

    expect(store.getSnapshot().status).toBe("loaded");
    expect(getMatchHistory).not.toHaveBeenCalled();
  });
});
