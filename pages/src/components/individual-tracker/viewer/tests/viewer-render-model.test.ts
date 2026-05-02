import { describe, expect, it } from "vitest";
import { aFakeIndividualTrackerStateWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import type {
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
} from "../../../../services/individual-tracker/types";
import { buildIndividualTrackerViewerRenderModel } from "../viewer-render-model";

function aHistoryEntryWith(
  overrides: Partial<TrackerMatchHistoryEntry> & Pick<TrackerMatchHistoryEntry, "matchId">,
): TrackerMatchHistoryEntry {
  return {
    matchId: overrides.matchId,
    startTime: overrides.startTime ?? "Jan 1, 2026, 12:00:00 AM",
    endTime: overrides.endTime ?? "Jan 1, 2026, 12:10:00 AM",
    startTimeIso: overrides.startTimeIso ?? "2026-01-01T00:00:00.000Z",
    endTimeIso: overrides.endTimeIso ?? "2026-01-01T00:10:00.000Z",
    duration: overrides.duration ?? "10m 0s",
    mapName: overrides.mapName ?? "Aquarius",
    modeName: overrides.modeName ?? "Slayer",
    gameTypeAndMap: overrides.gameTypeAndMap ?? "Slayer: Aquarius",
    outcome: overrides.outcome ?? "Win",
    resultString: overrides.resultString ?? "Win - 50:40",
    isMatchmaking: overrides.isMatchmaking ?? false,
    category: overrides.category ?? "custom",
    teams: overrides.teams ?? [
      ["TrackedPlayer", "Teammate"],
      ["Enemy1", "Enemy2"],
    ],
    rawMatchStats: overrides.rawMatchStats,
    playerXuidToGametag: overrides.playerXuidToGametag,
    mapThumbnailUrl: overrides.mapThumbnailUrl ?? "data:,",
  };
}

function aHistoryResponseWith(
  matches: readonly TrackerMatchHistoryEntry[],
  suggestedGroupings: readonly (readonly string[])[],
): TrackerMatchHistoryResponse {
  return {
    matches,
    suggestedGroupings,
  };
}

describe("buildIndividualTrackerViewerRenderModel", () => {
  it("keeps grouped and standalone items in historical order", () => {
    const matches = [
      aHistoryEntryWith({
        matchId: "m1",
        startTimeIso: "2026-01-01T00:00:00.000Z",
        endTimeIso: "2026-01-01T00:10:00.000Z",
      }),
      aHistoryEntryWith({
        matchId: "m2",
        startTimeIso: "2026-01-01T00:15:00.000Z",
        endTimeIso: "2026-01-01T00:25:00.000Z",
      }),
      aHistoryEntryWith({
        matchId: "m3",
        startTimeIso: "2026-01-01T00:30:00.000Z",
        endTimeIso: "2026-01-01T00:40:00.000Z",
        resultString: "Loss - 40:50",
        outcome: "Loss",
      }),
      aHistoryEntryWith({
        matchId: "m4",
        startTimeIso: "2026-01-01T00:45:00.000Z",
        endTimeIso: "2026-01-01T00:55:00.000Z",
      }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m1", "m2", "m3", "m4"],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, [["m2", "m3"]]),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    expect(renderModel?.gameplayTimeline.map((item) => ({ type: item.type, id: item.id }))).toEqual([
      { type: "match", id: "m1" },
      { type: "group", id: "series-1" },
      { type: "match", id: "m4" },
    ]);
  });

  it("preserves match order inside grouped series based on tracked history order", () => {
    const matches = [
      aHistoryEntryWith({ matchId: "m1" }),
      aHistoryEntryWith({ matchId: "m2", resultString: "Loss - 48:50", outcome: "Loss" }),
      aHistoryEntryWith({ matchId: "m3" }),
      aHistoryEntryWith({ matchId: "m4" }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m1", "m2", "m3", "m4"],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, [["m3", "m2"]]),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    expect(renderModel?.gameplayTimeline).toHaveLength(3);

    const groupedItem = renderModel?.gameplayTimeline[1];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.matches.map((match) => match.id)).toEqual(["m2", "m3"]);
      expect(groupedItem.overviewMatches.map((match) => match.id)).toEqual(["m2", "m3"]);
    }
  });
});
