import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { createMedalLookup, getMedalFromLookup } from "@guilty-spark/shared/halo/medals";
import {
  getMatchStats,
  getMedalsMetadata,
  getPlayerXuidsToGametags,
} from "../../../../../../api/services/halo/fakes/data";
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
      medalMetadata: {},
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
      medalMetadata: {},
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
      medalMetadata: {},
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
      medalMetadata: {},
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

  it("uses NeatQueue series metadata for grouped-series team names and players", () => {
    const matches = [
      aHistoryEntryWith({
        matchId: "m1",
        teams: [
          ["TrackedPlayer", "Teammate"],
          ["Enemy1", "Enemy2"],
        ],
      }),
      aHistoryEntryWith({
        matchId: "m2",
        teams: [
          ["TrackedPlayer", "Teammate"],
          ["Enemy1", "Enemy2"],
        ],
      }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      matchIds: ["m2", "m1"],
      matchGroupings: [["m1", "m2"]],
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Clutch Academy",
          subtitleOverride: "Queue #12",
          neatQueueSeriesData: {
            seriesId: {
              guildId: "guild-1",
              queueNumber: 12,
            },
            teams: [
              { name: "Eagles", playerIds: ["discord-1", "discord-2"] },
              { name: "Cobras", playerIds: ["discord-3", "discord-4"] },
            ],
            seriesScore: "1:1",
            matchIds: ["m1", "m2"],
            playersAssociationData: {
              "discord-1": {
                discordId: "discord-1",
                discordName: "Tracked Discord",
                xboxId: "xuid-1",
                gamertag: "TrackedPlayer",
                currentRank: null,
                currentRankTier: null,
                currentRankSubTier: null,
                currentRankMeasurementMatchesRemaining: null,
                currentRankInitialMeasurementMatches: null,
                allTimePeakRank: null,
                esra: null,
                lastRankedGamePlayed: null,
              },
              "discord-2": {
                discordId: "discord-2",
                discordName: "Team Mate",
                xboxId: "xuid-2",
                gamertag: "Teammate",
                currentRank: null,
                currentRankTier: null,
                currentRankSubTier: null,
                currentRankMeasurementMatchesRemaining: null,
                currentRankInitialMeasurementMatches: null,
                allTimePeakRank: null,
                esra: null,
                lastRankedGamePlayed: null,
              },
              "discord-3": {
                discordId: "discord-3",
                discordName: "Enemy One",
                xboxId: "xuid-3",
                gamertag: "Enemy1",
                currentRank: null,
                currentRankTier: null,
                currentRankSubTier: null,
                currentRankMeasurementMatchesRemaining: null,
                currentRankInitialMeasurementMatches: null,
                allTimePeakRank: null,
                esra: null,
                lastRankedGamePlayed: null,
              },
              "discord-4": {
                discordId: "discord-4",
                discordName: "Enemy Two",
                xboxId: "xuid-4",
                gamertag: "Enemy2",
                currentRank: null,
                currentRankTier: null,
                currentRankSubTier: null,
                currentRankMeasurementMatchesRemaining: null,
                currentRankInitialMeasurementMatches: null,
                allTimePeakRank: null,
                esra: null,
                lastRankedGamePlayed: null,
              },
            },
            substitutions: [],
            startTime: "2026-01-01T00:00:00.000Z",
            lastUpdateTime: "2026-01-01T00:30:00.000Z",
          },
        },
      ],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, []),
      medalMetadata: {},
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    const groupedItem = renderModel?.gameplayTimeline[0];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.teams.map((team) => team.name)).toEqual(["Eagles", "Cobras"]);
      expect(groupedItem.teams[0]?.players.map((player) => player.content)).toEqual(["TrackedPlayer", "Teammate"]);
      expect(groupedItem.teams[1]?.players.map((player) => player.content)).toEqual(["Enemy1", "Enemy2"]);
    }
  });

  it("builds active NeatQueue pre-series data when the tracker has an active queue", () => {
    const state = aFakeIndividualTrackerStateWith({
      gamertag: "TrackedPlayer",
      activeNeatQueueSeries: {
        titleOverride: "Clutch Academy",
        subtitleOverride: "Queue #12",
        neatQueueSeriesData: {
          seriesId: {
            guildId: "guild-1",
            queueNumber: 12,
          },
          teams: [
            { name: "Eagles", playerIds: ["discord-1", "discord-2"] },
            { name: "Cobras", playerIds: ["discord-3", "discord-4"] },
          ],
          seriesScore: "0:0",
          matchIds: [],
          playersAssociationData: {
            "discord-1": {
              discordId: "discord-1",
              discordName: "Tracked Discord",
              xboxId: "xuid-1",
              gamertag: "TrackedPlayer",
              currentRank: null,
              currentRankTier: null,
              currentRankSubTier: null,
              currentRankMeasurementMatchesRemaining: null,
              currentRankInitialMeasurementMatches: null,
              allTimePeakRank: null,
              esra: null,
              lastRankedGamePlayed: null,
            },
            "discord-2": {
              discordId: "discord-2",
              discordName: "Team Mate",
              xboxId: "xuid-2",
              gamertag: "Teammate",
              currentRank: null,
              currentRankTier: null,
              currentRankSubTier: null,
              currentRankMeasurementMatchesRemaining: null,
              currentRankInitialMeasurementMatches: null,
              allTimePeakRank: null,
              esra: null,
              lastRankedGamePlayed: null,
            },
            "discord-3": {
              discordId: "discord-3",
              discordName: "Enemy One",
              xboxId: "xuid-3",
              gamertag: "Enemy1",
              currentRank: null,
              currentRankTier: null,
              currentRankSubTier: null,
              currentRankMeasurementMatchesRemaining: null,
              currentRankInitialMeasurementMatches: null,
              allTimePeakRank: null,
              esra: null,
              lastRankedGamePlayed: null,
            },
            "discord-4": {
              discordId: "discord-4",
              discordName: "Enemy Two",
              xboxId: "xuid-4",
              gamertag: "Enemy2",
              currentRank: null,
              currentRankTier: null,
              currentRankSubTier: null,
              currentRankMeasurementMatchesRemaining: null,
              currentRankInitialMeasurementMatches: null,
              allTimePeakRank: null,
              esra: null,
              lastRankedGamePlayed: null,
            },
          },
          substitutions: [
            {
              playerOutId: "discord-3",
              playerInId: "discord-5",
              teamIndex: 1,
              teamName: "Cobras",
              timestamp: "2026-01-01T00:05:00.000Z",
            },
          ],
          startTime: "2026-01-01T00:00:00.000Z",
          lastUpdateTime: "2026-01-01T00:05:00.000Z",
        },
      },
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith([], []),
      medalMetadata: {},
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel?.activeNeatQueueSeries).not.toBeNull();
    expect(renderModel?.activeNeatQueueSeries?.title).toBe("Clutch Academy");
    expect(renderModel?.activeNeatQueueSeries?.teams.map((team) => team.name)).toEqual(["Eagles", "Cobras"]);
    expect(renderModel?.activeNeatQueueSeries?.teams[0]?.players.map((player) => player.displayName)).toEqual([
      "TrackedPlayer",
      "Teammate",
    ]);
    expect(renderModel?.activeNeatQueueSeries?.substitutions[0]?.playerOutDisplayName).toBe("Enemy1");
    expect(renderModel?.activeNeatQueueSeries?.substitutions[0]?.playerInDisplayName).toBe("discord-5");
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
      medalMetadata: {},
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
      medalMetadata: {},
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

  it("computes series score from displayed team-side results instead of tracked-player outcomes", () => {
    const matches = [
      aHistoryEntryWith({
        matchId: "m1",
        outcome: "Win",
        resultString: "Win - 2:3",
        teams: [
          ["being03", "OthyYEHx"],
          ["CAP0 CRIMINI", "Looneyy"],
        ],
        startTimeIso: "2026-01-01T00:00:00.000Z",
      }),
      aHistoryEntryWith({
        matchId: "m2",
        outcome: "Win",
        resultString: "Win - 4:3",
        teams: [
          ["being03", "OthyYEHx"],
          ["CAP0 CRIMINI", "Looneyy"],
        ],
        startTimeIso: "2026-01-01T00:15:00.000Z",
      }),
      aHistoryEntryWith({
        matchId: "m3",
        outcome: "Unknown",
        resultString: "Unknown - 1:2 (247:261)",
        teams: [
          ["being03", "OthyYEHx"],
          ["CAP0 CRIMINI", "Looneyy"],
        ],
        startTimeIso: "2026-01-01T00:30:00.000Z",
      }),
    ] as const;

    const state = aFakeIndividualTrackerStateWith({
      gamertag: "CAP0 CRIMINI",
      matchIds: ["m3", "m2", "m1"],
      matchGroupings: [["m1", "m2", "m3"]],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(matches, []),
      medalMetadata: {},
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel).not.toBeNull();
    const groupedItem = renderModel?.gameplayTimeline[0];
    expect(groupedItem?.type).toBe("group");
    if (groupedItem?.type === "group") {
      expect(groupedItem.seriesScore).toBe("1:2");
      expect(groupedItem.overviewMatches.map((match) => match.winningTeamIndex)).toEqual([1, 0, 1]);
    }
  });

  it("uses medal metadata to resolve medal names in match stats", () => {
    const rawMatchStats = Preconditions.checkExists(getMatchStats("32b4cddf-5451-4d83-bcf6-000land-grab"));
    const medalId = Preconditions.checkExists(
      rawMatchStats.Players.flatMap((player) =>
        player.PlayerTeamStats.flatMap((teamStats) => teamStats.Stats.CoreStats.Medals.map((medal) => medal.NameId)),
      )[0],
    );
    const medalLookup = createMedalLookup(getMedalsMetadata());
    const medal = Preconditions.checkExists(getMedalFromLookup(medalLookup, medalId));
    const playerXuidToGametag = Object.fromEntries(getPlayerXuidsToGametags());
    const trackedGamertag = Object.values(playerXuidToGametag)[0] ?? "TrackedPlayer";

    const state = aFakeIndividualTrackerStateWith({
      gamertag: trackedGamertag,
      matchIds: [rawMatchStats.MatchId],
    });

    const renderModel = buildIndividualTrackerViewerRenderModel({
      state,
      matchHistory: aHistoryResponseWith(
        [
          aHistoryEntryWith({
            matchId: rawMatchStats.MatchId,
            rawMatchStats,
            playerXuidToGametag,
          }),
        ],
        [],
      ),
      medalMetadata: {
        [medalId]: {
          name: medal.name,
          sortingWeight: medal.sortingWeight,
        },
      },
      defaultTeamColor: "salmon",
      defaultEnemyColor: "cerulean",
    });

    expect(renderModel?.gameplayTimeline[0]?.type).toBe("match");
    if (renderModel?.gameplayTimeline[0]?.type === "match") {
      const playerMedals = renderModel.gameplayTimeline[0].match.matchStats?.flatMap((team) =>
        team.players.flatMap((player) => player.medals.map((medalEntry) => medalEntry.name)),
      );

      expect(playerMedals).toContain(medal.name);
    }
  });
});
