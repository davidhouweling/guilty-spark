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
    mapAssetId: overrides.mapAssetId ?? `map-${overrides.matchId}`,
    mapVersionId: overrides.mapVersionId ?? `map-version-${overrides.matchId}`,
    modeAssetId: overrides.modeAssetId ?? `mode-${overrides.matchId}`,
    modeVersionId: overrides.modeVersionId ?? `mode-version-${overrides.matchId}`,
    gameVariantCategory: overrides.gameVariantCategory ?? 6,
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
  it("flips reverse-chronological tracker history into chronological viewer order", () => {
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
      matchIds: ["m4", "m3", "m2", "m1"],
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
      { type: "group", id: "series:m2:m3" },
      { type: "match", id: "m4" },
    ]);
  });

  it("preserves chronological match order inside grouped series", () => {
    const matches = [
      aHistoryEntryWith({ matchId: "m1" }),
      aHistoryEntryWith({ matchId: "m2", resultString: "Loss - 48:50", outcome: "Loss" }),
      aHistoryEntryWith({ matchId: "m3" }),
      aHistoryEntryWith({ matchId: "m4" }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m4", "m3", "m2", "m1"],
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

  it("prefers persisted tracker match groupings over heuristic suggested groupings", () => {
    const matches = [
      aHistoryEntryWith({ matchId: "m1" }),
      aHistoryEntryWith({ matchId: "m2" }),
      aHistoryEntryWith({ matchId: "m3" }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m3", "m2", "m1"],
      matchGroupings: [["m1", "m2"]],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, [["m2", "m3"]]),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel?.gameplayTimeline.map((item) => ({ type: item.type, id: item.id }))).toEqual([
      { type: "group", id: "series:m1:m2" },
      { type: "match", id: "m3" },
    ]);
  });

  it("uses stored series-group overrides before falling back to default labels", () => {
    const matches = [
      aHistoryEntryWith({ matchId: "m1" }),
      aHistoryEntryWith({ matchId: "m2" }),
      aHistoryEntryWith({ matchId: "m3" }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m3", "m2", "m1"],
      matchGroupings: [["m1", "m2"]],
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #7",
        },
      ],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, []),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    const groupedItem = renderModel?.gameplayTimeline[0];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.title).toBe("Dog Crew");
      expect(groupedItem.subtitle).toBe("Queue #7");
    }
  });

  it("infers Best of 5 from a grouped 3-0 series", () => {
    const matches = [
      aHistoryEntryWith({ matchId: "m1", outcome: "Win", startTimeIso: "2026-01-01T00:00:00.000Z" }),
      aHistoryEntryWith({ matchId: "m2", outcome: "Win", startTimeIso: "2026-01-01T00:15:00.000Z" }),
      aHistoryEntryWith({ matchId: "m3", outcome: "Win", startTimeIso: "2026-01-01T00:30:00.000Z" }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m3", "m2", "m1"],
      matchGroupings: [["m1", "m2", "m3"]],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, []),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    const groupedItem = renderModel?.gameplayTimeline[0];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.subtitle).toBe("Best of 5");
    }
  });

  it("does not let deduped duplicate wins inflate Best of X", () => {
    const matches = [
      aHistoryEntryWith({
        matchId: "m1",
        outcome: "Win",
        startTimeIso: "2026-01-01T00:00:00.000Z",
        mapAssetId: "map-shared",
        mapVersionId: "map-version-shared",
        gameVariantCategory: 6,
      }),
      aHistoryEntryWith({
        matchId: "m2",
        outcome: "Win",
        startTimeIso: "2026-01-01T00:15:00.000Z",
        mapAssetId: "map-shared",
        mapVersionId: "map-version-shared",
        gameVariantCategory: 6,
      }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m2", "m1"],
      matchGroupings: [["m1", "m2"]],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, []),
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    const groupedItem = renderModel?.gameplayTimeline[0];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.subtitle).toBe("Best of 1");
      expect(groupedItem.seriesScore).toBe("1:0");
    }
  });
});
