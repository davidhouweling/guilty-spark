import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";

import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { toLiveTrackerStateRenderModel } from "../state-render-model";

describe("toLiveTrackerStateRenderModel", () => {
  it("maps teams and matches with stable ordering", () => {
    expect.assertions(12);
    const model = toLiveTrackerStateRenderModel(sampleLiveTrackerStateMessage, {});

    expect(model.type).toBe("neatqueue");
    expect(model.queueNumber).toBe(sampleLiveTrackerStateMessage.data.queueNumber);
    expect(model.status).toBe(sampleLiveTrackerStateMessage.data.status);

    expect(model.teams.length).toBe(2);
    expect(model.teams[0]?.name).toBe("Team 1");
    expect(model.teams[1]?.name).toBe("Team 2");

    expect(model.teams[0]?.players.length).toBe(4);
    expect(model.teams[0]?.players[0]?.id).toBe("998023469566533633");

    expect(model.matches.length).toBe(5);

    // Sorted by endTime ascending (ISO strings)
    expect(model.matches[0]?.endTime).toBe("2026-03-28T10:02:25.185Z");
    expect(model.matches[0]?.matchId).toBe("3d203681-2950-46a9-b6ae-d9da82d3d0d5");
    expect(model.matches[model.matches.length - 1]?.endTime).toBe("2026-03-28T11:07:51.805Z");
  });

  it("normalizes invalid series score values to 0:0", () => {
    const fallbackSeriesData = {
      seriesId: {
        guildId: sampleLiveTrackerStateMessage.data.guildId,
        queueNumber: sampleLiveTrackerStateMessage.data.queueNumber,
      },
      teams: [],
      seriesScore: "-",
      matchIds: [],
      startTime: sampleLiveTrackerStateMessage.data.lastUpdateTime,
      lastUpdateTime: sampleLiveTrackerStateMessage.data.lastUpdateTime,
    };

    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        seriesScore: "-",
        seriesData: {
          ...(sampleLiveTrackerStateMessage.data.seriesData ?? fallbackSeriesData),
          seriesScore: "-",
        },
      },
    };

    const model = toLiveTrackerStateRenderModel(message, {});

    expect(model.seriesScore).toBe("0:0");
    expect(model.seriesData?.seriesScore).toBe("0:0");
  });

  it("shows only unplayed planned slots after collapsing resumed matches", () => {
    const first = sampleLiveTrackerStateMessage.data.matchSummaries.at(0);
    const second = sampleLiveTrackerStateMessage.data.matchSummaries.at(1);
    if (first == null || second == null) {
      throw new Error("Expected sample matches");
    }
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        matchSummaries: [first, { ...second, gameMap: "Actual Map", gameType: "Actual Mode" }],
        rawMatches: {
          [first.matchId]: {
            MatchId: first.matchId,
            Teams: [],
            Players: [],
            MatchInfo: {
              StartTime: first.startTime,
              EndTime: first.endTime,
              MapVariant: { AssetId: "map-a", VersionId: "v1" },
              GameVariantCategory: 1,
            },
          },
          [second.matchId]: {
            MatchId: second.matchId,
            Teams: [],
            Players: [],
            MatchInfo: {
              StartTime: second.startTime,
              EndTime: second.endTime,
              MapVariant: { AssetId: "map-a", VersionId: "v1" },
              GameVariantCategory: 1,
            },
          },
        },
        plannedMaps: [
          { mode: "Slayer", map: "Planned Map" },
          { mode: "Oddball", map: "Next Map" },
        ],
      },
    };

    const model = toLiveTrackerStateRenderModel(message, {});

    expect(model.plannedGames).toEqual([
      {
        gameNumber: 2,
        mode: "Oddball",
        map: "Next Map",
        gameMapThumbnailUrl: "data:,",
        gameVariantCategory: GameVariantCategory.MultiplayerOddball,
      },
    ]);
  });

  it("keeps all planned slots before the first game and removes them on clear", () => {
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: { ...sampleLiveTrackerStateMessage.data, matchSummaries: [], rawMatches: {} },
    };
    const model = toLiveTrackerStateRenderModel(message, {});

    expect(model.plannedGames).toHaveLength(sampleLiveTrackerStateMessage.data.plannedMaps?.length ?? 0);
    expect(
      toLiveTrackerStateRenderModel({ ...message, data: { ...message.data, plannedMaps: [] } }, {}).plannedGames,
    ).toEqual([]);
  });

  it("uses a completed match thumbnail for a planned map with the same name", () => {
    const firstSummary = sampleLiveTrackerStateMessage.data.matchSummaries.at(0);
    if (firstSummary == null) {
      throw new Error("Expected sample match summary");
    }
    const summary = {
      ...firstSummary,
      gameMap: "Recharge",
      gameMapThumbnailUrl: "https://example.com/recharge.png",
    };
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        matchSummaries: [summary],
        rawMatches: {},
        plannedMaps: [{ mode: "Strongholds", map: "Recharge" }],
      },
    };

    expect(toLiveTrackerStateRenderModel(message, {}).plannedGames[0]?.gameMapThumbnailUrl).toBe(
      "https://example.com/recharge.png",
    );
  });
});
