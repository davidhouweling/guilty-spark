import { describe, expect, it } from "vitest";
import {
  trackerViewContract,
  trackerViewMessageContract,
  trackerViewMessageSchema,
  type TrackerViewMessage,
  type TrackerViewResponse,
} from "../view";

describe("trackerViewContract", () => {
  const validResponse: TrackerViewResponse = {
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      isLive: true,
      matches: [
        {
          matchId: "match-1",
          startTime: "2024-11-26T11:00:00.000Z",
          endTime: "2024-11-26T11:10:00.000Z",
          mapAssetId: "map-1",
          mapVersionId: "map-v-1",
          mapName: "Aquarius",
          modeAssetId: "mode-1",
          gameVariantCategory: 6,
          outcome: "Win",
          score: "50:42",
          killsDeathsAssistsKda: "10:7:4 (1.57)",
          damageDealtTakenRatio: "4,200:3,900 (1.08)",
          isMatchmaking: false,
        },
      ],
      series: [
        {
          id: "series:match-1:match-2",
          matchIds: ["match-1", "match-2"],
          score: "2:1",
          title: "Eagle vs Cobra",
          subtitle: "Best of 3",
        },
      ],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
      hasActiveSeries: false,
      hasRecentCompletedSeries: false,
    },
  };

  it("parses a valid view response", () => {
    expect(trackerViewContract.parse(validResponse)).toEqual(validResponse);
  });

  it("round-trips through toResponse/fromResponse", async () => {
    const response = trackerViewContract.toResponse(validResponse, { noStore: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(trackerViewContract.fromResponse(response)).resolves.toEqual(validResponse);
  });

  it("accepts a null lastMatchDiscoveredAt and empty matches", () => {
    const result = trackerViewContract.safeParse({
      view: {
        trackerId: "t2",
        gamertag: "StoppedTag",
        status: "stopped",
        isLive: false,
        matches: [],
        series: [],
        lastUpdateTime: "",
        lastMatchDiscoveredAt: null,
        hasActiveSeries: false,
        hasRecentCompletedSeries: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts statsHighlights with rank icon metadata", () => {
    const result = trackerViewContract.safeParse({
      view: {
        trackerId: "t3",
        gamertag: "RankedTag",
        status: "active",
        isLive: true,
        matches: [],
        series: [],
        lastUpdateTime: "2024-11-26T12:00:00.000Z",
        lastMatchDiscoveredAt: null,
        hasActiveSeries: false,
        hasRecentCompletedSeries: false,
        statsHighlights: [
          {
            label: "Current Rank",
            value: "1,567",
            rankIcon: {
              rankTier: "Onyx",
              subTier: 0,
              measurementMatchesRemaining: 0,
              initialMeasurementMatches: 10,
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts preSeriesPlayerInfo", () => {
    const result = trackerViewContract.safeParse({
      view: {
        trackerId: "t4",
        gamertag: "ProfileTag",
        status: "active",
        isLive: true,
        matches: [],
        series: [],
        lastUpdateTime: "2024-11-26T12:00:00.000Z",
        lastMatchDiscoveredAt: null,
        hasActiveSeries: false,
        hasRecentCompletedSeries: false,
        preSeriesPlayerInfo: {
          currentRank: 1520,
          currentRankTier: "Diamond",
          currentRankSubTier: 1,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRank: 1650,
          esra: 1501,
          lastRankedGamePlayed: "2024-11-26T10:00:00.000Z",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts guildIconUrl in activeSeriesContext", () => {
    const result = trackerViewContract.safeParse({
      view: {
        trackerId: "t5",
        gamertag: "IconTag",
        status: "active",
        isLive: true,
        matches: [],
        series: [],
        lastUpdateTime: "2024-11-26T12:00:00.000Z",
        lastMatchDiscoveredAt: null,
        hasActiveSeries: true,
        hasRecentCompletedSeries: false,
        activeSeriesContext: {
          title: "Eagle vs Cobra",
          subtitle: "Best of 3",
          guildIconUrl: "https://cdn.example.com/icon.png",
          teams: [],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const result = trackerViewContract.safeParse({
      ...validResponse,
      view: { ...validResponse.view, status: "bogus" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid match outcome", () => {
    const result = trackerViewContract.safeParse({
      ...validResponse,
      view: {
        ...validResponse.view,
        matches: [
          {
            ...validResponse.view.matches[0],
            outcome: "win",
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("trackerViewMessageSchema", () => {
  const validMessage: TrackerViewMessage = {
    type: "view",
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      matches: [
        {
          matchId: "match-1",
          startTime: "2024-11-26T11:00:00.000Z",
          endTime: "2024-11-26T11:10:00.000Z",
          mapAssetId: "map-1",
          mapVersionId: "map-v-1",
          mapName: "Aquarius",
          modeAssetId: "mode-1",
          gameVariantCategory: 6,
          outcome: "Win",
          score: "50:42",
          killsDeathsAssistsKda: "10:7:4 (1.57)",
          damageDealtTakenRatio: "4,200:3,900 (1.08)",
          isMatchmaking: false,
        },
      ],
      series: [],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
      hasActiveSeries: false,
      hasRecentCompletedSeries: false,
      statsHighlights: [{ label: "KDA", value: "3.0" }],
    },
  };

  it("round-trips a valid view message", () => {
    expect(trackerViewMessageSchema.parse(validMessage)).toEqual(validMessage);
  });

  it("does not include isLive in the websocket live-view payload", () => {
    expect("isLive" in validMessage.view).toBe(false);
  });

  it("accepts preSeriesPlayerInfo in websocket payload", () => {
    const result = trackerViewMessageSchema.safeParse({
      ...validMessage,
      view: {
        ...validMessage.view,
        preSeriesPlayerInfo: {
          currentRank: 1500,
          currentRankTier: "Diamond",
          currentRankSubTier: 2,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRank: 1610,
          esra: 1488,
          lastRankedGamePlayed: "2024-11-26T10:00:00.000Z",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a message with the wrong type literal", () => {
    const result = trackerViewMessageSchema.safeParse({ ...validMessage, type: "state" });
    expect(result.success).toBe(false);
  });
});

describe("trackerViewMessageContract", () => {
  const message: TrackerViewMessage = {
    type: "view",
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      matches: [],
      series: [],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: null,
      hasActiveSeries: false,
      hasRecentCompletedSeries: false,
    },
  };

  it("serialize/parse round-trips a view message", () => {
    expect(trackerViewMessageContract.parse(trackerViewMessageContract.serialize(message))).toEqual(message);
  });

  it("parse throws on a message with the wrong type literal", () => {
    expect(() => trackerViewMessageContract.parse(JSON.stringify({ ...message, type: "state" }))).toThrow();
  });
});
