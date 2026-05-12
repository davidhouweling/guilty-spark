import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { TrackerSearchResult } from "../../../services/individual-tracker/types";
import { buildIndividualTrackerTopBarStats } from "../top-bar-stats";
import type { IndividualTrackerViewerRenderModel } from "../types";

function aRenderModelWith(): IndividualTrackerViewerRenderModel {
  return {
    lastUpdatedTime: "2026-01-01T00:00:00.000Z",
    trackerStatus: "active",
    accumulatedStats: {
      total: 11,
      wins: 7,
      losses: 4,
      ties: 0,
      customOrLocal: 1,
      matchmaking: 10,
      groupedSeries: 1,
      standalone: 8,
    },
    teamColors: [],
    activeNeatQueueSeries: null,
    trackedPlayerTotals: {
      title: "Tracked totals",
      teamData: [],
      metadata: null,
      playerData: [
        {
          teamId: 0,
          teamStats: [],
          teamMedals: [],
          players: [
            {
              name: "Chief",
              medals: [],
              values: [
                { name: "Kills", value: 22, display: "22", bestInTeam: true, bestInMatch: true },
                { name: "Deaths", value: 11, display: "11", bestInTeam: true, bestInMatch: true },
                { name: "Assists", value: 6, display: "6", bestInTeam: true, bestInMatch: true },
                { name: "KDA", value: 17, display: "17.0", bestInTeam: true, bestInMatch: true },
                { name: "Damage dealt", value: 5000, display: "5000", bestInTeam: true, bestInMatch: true },
                { name: "Damage taken", value: 4500, display: "4500", bestInTeam: true, bestInMatch: true },
                { name: "Damage ratio", value: 1.11, display: "1.11", bestInTeam: true, bestInMatch: true },
                {
                  name: "Avg life time",
                  value: 90,
                  display: "1m 30s",
                  bestInTeam: true,
                  bestInMatch: true,
                },
                {
                  name: "Avg damage per life",
                  value: 700,
                  display: "700",
                  bestInTeam: true,
                  bestInMatch: true,
                },
              ],
            },
          ],
        },
      ],
    },
    gameplayTimeline: [
      {
        type: "group",
        id: "series-1",
        title: "Set 1",
        subtitle: "Best of 3",
        seriesScore: "2:1",
        overviewMatches: [],
        teams: [],
        seriesTotals: null,
        matches: [
          {
            id: "m1",
            matchStats: null,
            backgroundImageUrl: "",
            gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
            gameMode: "Slayer",
            matchNumber: 1,
            gameTypeAndMap: "Slayer: Aquarius",
            map: "Aquarius",
            duration: "10m",
            score: "Win - 50:40",
            startTime: "10:00",
            endTime: "10:10",
          },
          {
            id: "m2",
            matchStats: null,
            backgroundImageUrl: "",
            gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
            gameMode: "Slayer",
            matchNumber: 2,
            gameTypeAndMap: "Slayer: Streets",
            map: "Streets",
            duration: "10m",
            score: "Loss - 45:50",
            startTime: "10:15",
            endTime: "10:25",
          },
          {
            id: "m3",
            matchStats: null,
            backgroundImageUrl: "",
            gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
            gameMode: "Slayer",
            matchNumber: 3,
            gameTypeAndMap: "Slayer: Recharge",
            map: "Recharge",
            duration: "10m",
            score: "Win - 50:42",
            startTime: "10:30",
            endTime: "10:40",
          },
        ],
      },
    ],
    trackedEntriesCount: 11,
  };
}

function aTrackerSummaryWith(): TrackerSearchResult {
  return {
    gamertag: "Chief",
    xuid: "xuid-1",
    rankLabel: "Onyx",
    csrLabel: "1500",
    currentRankTier: "Onyx",
    currentRankSubTier: 0,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: "Onyx",
    allTimePeakCsrLabel: "1600",
    allTimePeakRankTier: "Onyx",
    allTimePeakRankSubTier: 0,
    seasonPeakCsrLabel: "1550",
    seasonPeakRankTier: "Onyx",
    seasonPeakRankSubTier: 0,
    matchmadeMatchCount: 1234,
    customMatchCount: 456,
  };
}

describe("buildIndividualTrackerTopBarStats", () => {
  it("formats configured slot items from the render model and tracker summary", () => {
    const items = buildIndividualTrackerTopBarStats({
      renderModel: aRenderModelWith(),
      trackerSummary: aTrackerSummaryWith(),
      topBarStatSlots: [
        "matches-win-loss",
        "series-win-loss",
        "total-games",
        "kills-deaths-assists-kda",
        "damage-dealt-taken-ratio",
        "current-rank",
      ],
    });

    expect(items).toEqual([
      { option: "matches-win-loss", label: "Matches Won/Loss", value: "2W:1L" },
      { option: "series-win-loss", label: "Series Won/Loss", value: "1SW:0SL" },
      { option: "total-games", label: "Total Games", value: "11" },
      { option: "kills-deaths-assists-kda", label: "Kills:Deaths:Assists (KDA)", value: "22:11:6 (17.0)" },
      { option: "damage-dealt-taken-ratio", label: "Damage D:T (D/T)", value: "5000:4500 (1.11)" },
      { option: "current-rank", label: "Current Rank", value: "Onyx (1500)" },
    ]);
  });

  it("falls back to N/A when a configured value is unavailable", () => {
    const items = buildIndividualTrackerTopBarStats({
      renderModel: aRenderModelWith(),
      trackerSummary: null,
      topBarStatSlots: ["current-rank", "esra"],
    });

    expect(items).toEqual([
      { option: "current-rank", label: "Current Rank", value: "N/A" },
      { option: "esra", label: "ESRA", value: "N/A" },
    ]);
  });
});
