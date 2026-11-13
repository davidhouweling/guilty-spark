import { describe, expect, it } from "vitest";
import { AssetKind, GameVariantCategory } from "halo-infinite-api";
import type { Stats } from "halo-infinite-api";
import { matchDetailSchema } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeCoreStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/halo/fakes/data";
import { aFakeMedalMetadataWith } from "@guilty-spark/shared/halo/fakes/medal-metadata.fake";
import { mapMatchDetail } from "../match-detail";
import type { MatchDetailOptions } from "../types";

function unresolvedOptions(): MatchDetailOptions {
  return { mapName: null, modeName: null, mapThumbnailUrl: null };
}

describe("mapMatchDetail", () => {
  it("uses raw numerical Slayer scores and supplied stable sides without reordering", () => {
    const match = aFakeMatchStatsWith({
      Teams: [
        aFakeTeamWith({ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50 }) } }),
        aFakeTeamWith({ TeamId: 3, Stats: { CoreStats: aFakeCoreStatsWith({ Score: 44 }) } }),
      ],
      Players: [],
    });
    const detail = mapMatchDetail(match, {
      ...unresolvedOptions(),
      matchTeamIdToSeriesTeamId: new Map([
        [7, 3],
        [3, 7],
      ]),
    });
    expect(detail.score).toEqual({
      primary: {
        metric: "score",
        teams: [
          { matchTeamId: 7, seriesTeamId: 3, value: 50 },
          { matchTeamId: 3, seriesTeamId: 7, value: 44 },
        ],
      },
      secondary: null,
    });
    expect(detail.teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
  });

  it("uses Oddball rounds as primary and raw score as secondary without inferring missing mappings", () => {
    const stats: Stats<GameVariantCategory.MultiplayerOddball> = {
      CoreStats: aFakeCoreStatsWith({ Score: 180, RoundsWon: 2 }),
      PvpStats: { Kills: 50, Deaths: 44, Assists: 27, KDA: 15 },
      OddballStats: {
        SkullGrabs: 2,
        KillsAsSkullCarrier: 3,
        SkullCarriersKilled: 4,
        TimeAsSkullCarrier: "PT5S",
        LongestTimeAsSkullCarrier: "PT2S",
        SkullScoringTicks: 5,
      },
    };
    const match = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerOddball },
      Teams: [
        aFakeTeamWith({ TeamId: 7, Stats: stats }),
        aFakeTeamWith({ TeamId: 3, Stats: { ...stats, CoreStats: aFakeCoreStatsWith({ Score: 120, RoundsWon: 1 }) } }),
      ],
      Players: [],
    });
    const detail = mapMatchDetail(match, {
      ...unresolvedOptions(),
      matchTeamIdToSeriesTeamId: new Map([[7, null]]),
    });
    expect(detail.score).toEqual({
      primary: {
        metric: "rounds-won",
        teams: [
          { matchTeamId: 7, seriesTeamId: null, value: 2 },
          { matchTeamId: 3, seriesTeamId: null, value: 1 },
        ],
      },
      secondary: {
        metric: "score",
        teams: [
          { matchTeamId: 7, seriesTeamId: null, value: 180 },
          { matchTeamId: 3, seriesTeamId: null, value: 120 },
        ],
      },
    });
  });

  it("maps variant metadata, playlist asset identity and exact duration policy", () => {
    const match = aFakeMatchStatsWith();
    match.MatchInfo.Playlist = { AssetKind: AssetKind.Playlist, AssetId: "playlist-id", VersionId: "playlist-version" };
    match.MatchInfo.PlaylistMapModePair = {
      AssetKind: AssetKind.MapModePair,
      AssetId: "pair-id",
      VersionId: "pair-version",
    };
    match.MatchInfo.StartTime = "2024-11-26T22:05:39.587+11:00";
    const detail = mapMatchDetail(match, {
      mapName: "Live Fire",
      modeName: "Slayer",
      mapThumbnailUrl: "https://example.com/map.png",
      plannedMapIndex: 0,
    });
    expect(detail.map).toEqual({
      assetId: match.MatchInfo.MapVariant.AssetId,
      versionId: match.MatchInfo.MapVariant.VersionId,
      name: "Live Fire",
      thumbnailUrl: "https://example.com/map.png",
    });
    expect(detail.mode).toEqual({
      assetId: match.MatchInfo.UgcGameVariant.AssetId,
      versionId: match.MatchInfo.UgcGameVariant.VersionId,
      gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
      name: "Slayer",
    });
    expect(detail).toMatchObject({
      matchId: match.MatchId,
      startTime: "2024-11-26T11:05:39.587Z",
      endTime: match.MatchInfo.EndTime,
      durationSeconds: 525.5,
      isMatchmaking: true,
      matchmakingPlaylist: "playlist-id",
      teamsEnabled: true,
      teamScoringEnabled: true,
      teamCount: 2,
      plannedMapIndex: 0,
    });
    expect(matchDetailSchema.parse(detail)).toEqual(detail);
  });

  it("keeps absent metadata and playlist nullable and omits an undefined planned index", () => {
    const match = aFakeMatchStatsWith();
    const detail = mapMatchDetail(match, {
      ...unresolvedOptions(),
      plannedMapIndex: undefined,
      identitiesByPlayerId: undefined,
      matchTeamIdToSeriesTeamId: undefined,
      medalMetadataById: undefined,
      medalDifficulties: undefined,
    });
    expect(detail.map.name).toBeNull();
    expect(detail.map.thumbnailUrl).toBeNull();
    expect(detail.mode.name).toBeNull();
    expect(detail.isMatchmaking).toBe(false);
    expect(detail.matchmakingPlaylist).toBeNull();
    expect(JSON.parse(JSON.stringify(detail))).not.toHaveProperty("plannedMapIndex");
    expect(detail.score.primary?.teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
  });

  it.each([
    ["PT0S", 0],
    ["PT38.16S", 38.2],
    ["PT1H5M30S", 3930],
    ["P1DT1S", 86401],
  ])("maps duration %s to %s seconds independently of playable duration", (duration, expected) => {
    const match = aFakeMatchStatsWith();
    match.MatchInfo.Duration = duration;
    match.MatchInfo.PlayableDuration = "PT1S";
    expect(mapMatchDetail(match, unresolvedOptions()).durationSeconds).toBe(expected);
  });

  it("retains a legitimate zero numerical score rather than treating it as unavailable", () => {
    const match = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith({ Score: 0 }) } })],
      Players: [],
    });
    expect(mapMatchDetail(match, unresolvedOptions()).score).toEqual({
      primary: { metric: "score", teams: [{ matchTeamId: 7, seriesTeamId: null, value: 0 }] },
      secondary: null,
    });
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])(
    "preserves TeamsEnabled %s and TeamScoringEnabled %s without dropping raw scores",
    (teamsEnabled, scoringEnabled) => {
      const match = aFakeMatchStatsWith();
      match.MatchInfo.TeamsEnabled = teamsEnabled;
      match.MatchInfo.TeamScoringEnabled = scoringEnabled;
      const detail = mapMatchDetail(match, unresolvedOptions());
      expect(detail.teamsEnabled).toBe(teamsEnabled);
      expect(detail.teamScoringEnabled).toBe(scoringEnabled);
      expect(detail.teamCount).toBe(2);
      expect(detail.score.primary?.teams.map((team) => team.value)).toEqual(
        match.Teams.map((team) => team.Stats.CoreStats.Score),
      );
    },
  );

  it("preserves zero-team unknown-mode identities without fabricating scores", () => {
    const match = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        // Persisted data can contain numeric categories absent from the installed enum.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
        GameVariantCategory: Number("999"),
      },
      Teams: [],
      Players: [aFakePlayerWith({ PlayerId: "unresolved", LastTeamId: 99 })],
    });
    const detail = mapMatchDetail(match, unresolvedOptions());
    expect(detail.mode.gameVariantCategory).toBe(999);
    expect(detail.teamCount).toBe(0);
    expect(detail.teams).toEqual([]);
    expect(detail.players[0]).toMatchObject({ playerId: "unresolved", lastMatchTeamId: null, teamStats: [] });
    expect(detail.score).toEqual({ primary: null, secondary: null });
  });

  it("composes identities, stat and medal serialization without raw data or input mutation", () => {
    const match = aFakeMatchStatsWith();
    const original = JSON.stringify(match);
    const identities = new Map([["xuid(1111111111)", { gamertag: "Resolved", discordUserId: "1234" }]]);
    const mappings = new Map([[0, 7]]);
    const metadata = { 622331684: aFakeMedalMetadataWith() };
    const options: MatchDetailOptions = {
      ...unresolvedOptions(),
      identitiesByPlayerId: identities,
      matchTeamIdToSeriesTeamId: mappings,
      medalMetadataById: metadata,
      medalDifficulties: ["Normal", "Heroic"],
    };
    const originalOptions = JSON.stringify({ metadata, identities: [...identities], mappings: [...mappings] });
    const detail = mapMatchDetail(match, options);
    expect(detail.players[0]).toMatchObject({ gamertag: "Resolved", discordUserId: "1234" });
    expect(detail.players[0]?.teamStats[0]?.stats.find((stat) => stat.key === "Kills")).toMatchObject({ value: 10 });
    expect(detail.teams[0]?.medals.find((medal) => medal.id === 622331684)).toMatchObject({
      name: "Killing Spree",
      difficulty: "Heroic",
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /rawMatch|seriesMatch|MatchInfo|PlayerTeamStats|CoreStats|BotAttributes/,
    );
    expect(JSON.stringify(match)).toBe(original);
    expect(JSON.stringify({ metadata, identities: [...identities], mappings: [...mappings] })).toBe(originalOptions);
  });

  it("rejects invalid planned indices, metadata URLs and chronology at the contract boundary", () => {
    const match = aFakeMatchStatsWith();
    expect(() => mapMatchDetail(match, { ...unresolvedOptions(), plannedMapIndex: -1 })).toThrow();
    expect(() => mapMatchDetail(match, { ...unresolvedOptions(), mapThumbnailUrl: "not-a-url" })).toThrow();
    match.MatchInfo.EndTime = "2024-11-25T00:00:00Z";
    expect(() => mapMatchDetail(match, unresolvedOptions())).toThrow("End precedes start");
  });
});
