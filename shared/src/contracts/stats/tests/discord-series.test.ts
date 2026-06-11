import { describe, expect, it } from "vitest";
import { discordSeriesStatsContract } from "../../stats/discord-series";

describe("discordSeriesStatsContract medalMetadata keys", () => {
  it("accepts numeric medal id string keys", () => {
    const parsed = discordSeriesStatsContract.safeParse({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: ["match-1"],
      renderData: {
        title: "Queue #7777 Series Stats",
        subtitle: "NeatQueue League",
        seriesScore: "1:0",
        medalMetadata: {
          "3334154676": {
            name: "Killing Spree",
            sortingWeight: 1500,
          },
        },
        teams: [
          { name: "Eagle", players: ["Player One"] },
          { name: "Cobra", players: ["Player Two"] },
        ],
        matches: [
          {
            matchId: "match-1",
            gameTypeAndMap: "Slayer: Live Fire",
            gameVariantCategory: 0,
            gameType: "Slayer",
            gameMap: "Live Fire",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 00s",
            gameScore: "50:45",
            gameSubScore: null,
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:10:00.000Z",
            playerXuidToGametag: {},
            rawMatch: {},
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects non-numeric medal metadata keys", () => {
    const parsed = discordSeriesStatsContract.safeParse({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: ["match-1"],
      renderData: {
        title: "Queue #7777 Series Stats",
        subtitle: "NeatQueue League",
        seriesScore: "1:0",
        medalMetadata: {
          spree: {
            name: "Killing Spree",
            sortingWeight: 1500,
          },
        },
        teams: [
          { name: "Eagle", players: ["Player One"] },
          { name: "Cobra", players: ["Player Two"] },
        ],
        matches: [
          {
            matchId: "match-1",
            gameTypeAndMap: "Slayer: Live Fire",
            gameVariantCategory: 0,
            gameType: "Slayer",
            gameMap: "Live Fire",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 00s",
            gameScore: "50:45",
            gameSubScore: null,
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:10:00.000Z",
            playerXuidToGametag: {},
            rawMatch: {},
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });
});
