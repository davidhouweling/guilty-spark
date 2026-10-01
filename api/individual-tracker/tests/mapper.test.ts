import { describe, expect, it } from "vitest";
import type { IndividualTrackerViewState } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/management";
import { toTrackerView } from "../mapper";

const row = {
  TrackerId: "tracker-1",
  UserId: "user-1",
  Gamertag: "Chief",
  Xuid: "xuid-1",
  Status: "active" as const,
  IsLive: 1 as const,
  CreatedAt: 0,
  UpdatedAt: 0,
};

function aViewState(): IndividualTrackerViewState {
  return {
    trackerId: "tracker-1",
    gamertag: "Chief",
    status: "active",
    matches: [],
    series: [
      {
        id: "series-1",
        matchIds: [],
        matchBackgroundUrls: [],
        score: "0:0",
        killsDeathsAssistsKda: "0.00",
        damageDealtTakenRatio: "0.00",
        title: "Series",
        subtitle: "Queue #1",
        guildIconUrl: null,
        plannedMaps: [{ mode: "Slayer", map: "Live Fire" }],
      },
    ],
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    lastMatchDiscoveredAt: null,
    hasActiveSeries: true,
    hasRecentCompletedSeries: false,
    activeSeriesContext: {
      title: "Series",
      subtitle: "Queue #1",
      guildIconUrl: null,
      teams: [],
      plannedMaps: [{ mode: "Slayer", map: "Live Fire" }],
    },
  };
}

describe("toTrackerView", () => {
  it("preserves planned maps on series groups and active series context", () => {
    const view = toTrackerView(row, aViewState());

    expect(view.series[0]?.plannedMaps).toEqual([{ mode: "Slayer", map: "Live Fire" }]);
    expect(view.activeSeriesContext?.plannedMaps).toEqual([{ mode: "Slayer", map: "Live Fire" }]);
  });
});
