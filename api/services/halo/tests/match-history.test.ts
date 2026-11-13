import { describe, expect, it } from "vitest";
import { GameVariantCategory, MatchOutcome } from "halo-infinite-api";
import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { analyzeMatchGroupings, formatMatchScore } from "@guilty-spark/shared/halo/match-enrichment";
import { formatMatchResultString } from "@guilty-spark/shared/halo/match-history";
import {
  aFakeCoreStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/halo/fakes/data";
import type { MatchStats } from "halo-infinite-api";
import { aFakePlayerMatchHistoryWith } from "../fakes/data";
import { mapCondensedMatchHistoryPage } from "../match-history";
import type { MatchHistoryMappingInput } from "../match-history";

const xuid = "1111111111";
const gamertags = new Map([
  [xuid, "Chief"],
  ["2222222222", "Ally"],
  ["3333333333", "Enemy"],
]);

function anInput(detail: MatchStats | null, matchId = detail?.MatchId ?? "missing"): MatchHistoryMappingInput {
  const info = aFakeMatchStatsWith().MatchInfo;
  return {
    match: aFakePlayerMatchHistoryWith({
      MatchId: matchId,
      MatchInfo: detail?.MatchInfo ?? info,
      Outcome: MatchOutcome.Win,
    }),
    detail,
    mapName: "Aquarius",
    modeName: "Oddball",
    mapThumbnailUrl: "data:,",
    matchmakingPlaylist: null,
  };
}

describe("mapCondensedMatchHistoryPage", () => {
  it("maps display fields, score and player contributions without raw match data", async () => {
    const stats = aFakeMatchStatsWith();
    const tracked = aFakePlayerWith({
      PlayerId: `xuid(${xuid})`,
      LastTeamId: 0,
      PlayerTeamStats: [
        {
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith({
              Kills: 12,
              Deaths: 8,
              Assists: 4,
              HeadshotKills: 7,
              ShotsFired: 100,
              ShotsHit: 60,
              DamageDealt: 1500,
              DamageTaken: 1000,
              Spawns: 4,
              AverageLifeDuration: "PT20S",
            }),
            PvpStats: { Kills: 12, Deaths: 8, Assists: 4, KDA: 0 },
          },
        },
      ],
    });
    const detail = aFakeMatchStatsWith({
      MatchInfo: { ...stats.MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerOddball },
      Players: [
        tracked,
        aFakePlayerWith({ PlayerId: "xuid(2222222222)", LastTeamId: 0 }),
        aFakePlayerWith({ PlayerId: "xuid(3333333333)", LastTeamId: 1 }),
      ],
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: { ...aFakeTeamWith().Stats, CoreStats: aFakeCoreStatsWith({ Score: 1250, RoundsWon: 2 }) },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: { ...aFakeTeamWith().Stats, CoreStats: aFakeCoreStatsWith({ Score: 900, RoundsWon: 1 }) },
        }),
      ],
    });
    const page = mapCondensedMatchHistoryPage([anInput(detail)], xuid, gamertags);
    const parsed = await condensedMatchHistoryPageContract.fromResponse(
      condensedMatchHistoryPageContract.toResponse(page),
    );
    expect(parsed.matches).toEqual([
      {
        matchId: detail.MatchId,
        startTimeIso: detail.MatchInfo.StartTime,
        endTimeIso: detail.MatchInfo.EndTime,
        durationIso: detail.MatchInfo.Duration,
        mapAssetId: detail.MatchInfo.MapVariant.AssetId,
        mapVersionId: detail.MatchInfo.MapVariant.VersionId,
        modeAssetId: detail.MatchInfo.UgcGameVariant.AssetId,
        modeVersionId: detail.MatchInfo.UgcGameVariant.VersionId,
        gameVariantCategory: GameVariantCategory.MultiplayerOddball,
        mapName: "Aquarius",
        modeName: "Oddball",
        mapThumbnailUrl: "data:,",
        outcome: "Win",
        isMatchmaking: false,
        matchmakingPlaylist: null,
        category: "custom",
        teams: [["Ally", "Chief"], ["Enemy"]],
        teamRosterSignature: "0:1111111111,2222222222|1:3333333333",
        teamCount: 2,
        score: { scores: [1250, 900], roundsWon: [2, 1] },
        trackedPlayerSummary: { kills: 12, deaths: 8, assists: 4, damageDealt: 1500, damageTaken: 1000 },
        highlightContribution: {
          kills: 12,
          deaths: 8,
          assists: 4,
          headshotKills: 7,
          shotsFired: 100,
          shotsHit: 60,
          damageDealt: 1500,
          damageTaken: 1000,
          totalLifeSeconds: 80,
          totalSpawns: 4,
          totalLifeSpawns: 4,
        },
      },
    ]);
    expect(parsed.suggestedGroupings).toEqual([]);
    expect(formatMatchScore([1250, 900], [2, 1], "en-US")).toBe("2:1 (1,250:900)");
    expect(formatMatchResultString("Win", [50, 40])).toBe("Win - 50:40");
  });

  it("retains history when details or the tracked player are unavailable", () => {
    const detail = aFakeMatchStatsWith({ Players: [aFakePlayerWith({ PlayerId: "xuid(3333333333)" })] });
    const page = mapCondensedMatchHistoryPage(
      [anInput(null), anInput(detail), anInput(detail, "wrong-id")],
      xuid,
      new Map(),
    );
    expect(page.matches[0]).toMatchObject({
      matchId: "missing",
      outcome: "Win",
      teams: [],
      teamRosterSignature: null,
      teamCount: null,
      score: null,
      trackedPlayerSummary: null,
      highlightContribution: null,
    });
    expect(page.matches[1]).toMatchObject({
      teams: [["*Unknown*"]],
      teamCount: 2,
      trackedPlayerSummary: null,
      highlightContribution: null,
    });
    expect(page.matches[2]).toMatchObject({ matchId: "wrong-id", teamCount: null, score: null });
  });

  it("preserves roster side swaps, page boundaries and unavailable barriers", () => {
    const first = aFakeMatchStatsWith({ MatchId: "first" });
    const swapped = aFakeMatchStatsWith({
      MatchId: "second",
      Players: first.Players.map((player) => ({ ...player, LastTeamId: player.LastTeamId === 0 ? 1 : 0 })),
    });
    const page1 = mapCondensedMatchHistoryPage([anInput(first)], xuid, gamertags);
    const page2 = mapCondensedMatchHistoryPage([anInput(swapped)], xuid, gamertags);
    expect(page1.matches[0]?.teamRosterSignature).toBe("0:1111111111,2222222222|1:3333333333,4444444444");
    expect(page2.matches[0]?.teamRosterSignature).toBe("0:3333333333,4444444444|1:1111111111,2222222222");
    expect(page1.suggestedGroupings).toEqual([]);
    expect(analyzeMatchGroupings([...page1.matches, ...page2.matches])).toEqual([["first", "second"]]);
    const barrier = mapCondensedMatchHistoryPage([anInput(first), anInput(null), anInput(swapped)], xuid, gamertags);
    expect(barrier.suggestedGroupings).toEqual([]);
  });

  it("does not count malformed average life duration and retains matchmaking category", () => {
    const player = aFakePlayerWith({
      PlayerId: `xuid(${xuid})`,
      PlayerTeamStats: [
        {
          TeamId: 1,
          Stats: {
            ...aFakeTeamWith().Stats,
            CoreStats: aFakeCoreStatsWith({ AverageLifeDuration: "invalid", Spawns: 5 }),
          },
        },
      ],
    });
    const stats = aFakeMatchStatsWith({ Players: [player] });
    const match = aFakePlayerMatchHistoryWith({
      MatchId: stats.MatchId,
      MatchInfo: { ...stats.MatchInfo, Playlist: stats.MatchInfo.MapVariant },
    });
    const page = mapCondensedMatchHistoryPage(
      [{ ...anInput(stats), match, matchmakingPlaylist: "Ranked Arena" }],
      xuid,
      gamertags,
    );
    expect(page.matches[0]).toMatchObject({
      isMatchmaking: true,
      category: "matchmaking",
      matchmakingPlaylist: "Ranked Arena",
      highlightContribution: { totalLifeSeconds: 0, totalSpawns: 5, totalLifeSpawns: 0 },
    });
  });
});
