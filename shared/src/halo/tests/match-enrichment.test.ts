import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { aFakeMatchStatsWith, aFakeTeamWith, aFakeCoreStatsWith, aFakePlayerWith } from "../fakes/data";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  collapseSequentialSeriesEntries,
  getMatchOutcomeLabel,
  normalizeModeName,
} from "../match-enrichment";

describe("getMatchOutcomeLabel()", () => {
  it.each([
    [1, "Tie"],
    [2, "Win"],
    [3, "Loss"],
    [4, "DNF"],
    [null, "Unknown"],
    [99, "Unknown"],
  ])("returns %s for outcome code %s", (outcomeCode, expected) => {
    expect(getMatchOutcomeLabel(outcomeCode)).toBe(expected);
  });
});

describe("buildMatchScore()", () => {
  const aFakePvpStats = (): { Kills: number; Deaths: number; Assists: number; KDA: number } => ({
    Kills: 0,
    Deaths: 0,
    Assists: 0,
    KDA: 0,
  });

  it("returns the bare team scores for a normal mode", () => {
    const matchStats = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerSlayer },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50 }), PvpStats: aFakePvpStats() },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 42 }), PvpStats: aFakePvpStats() },
        }),
      ],
    });

    expect(buildMatchScore(matchStats)).toBe("50:42");
  });

  it("includes rounds won and score for Oddball", () => {
    const matchStats = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerOddball },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50, RoundsWon: 3 }), PvpStats: aFakePvpStats() },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 42, RoundsWon: 2 }), PvpStats: aFakePvpStats() },
        }),
      ],
    });

    expect(buildMatchScore(matchStats)).toBe("3:2 (50:42)");
  });
});

describe("buildTeamRosterSignature()", () => {
  it("serializes present-at-beginning real players grouped by team, sorted deterministically", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(20)", LastTeamId: 1 }),
        aFakePlayerWith({ PlayerId: "xuid(10)", LastTeamId: 1 }),
        aFakePlayerWith({ PlayerId: "xuid(30)", LastTeamId: 0 }),
      ],
    });

    expect(buildTeamRosterSignature(matchStats)).toBe("0:30|1:10,20");
  });

  it("produces the same signature regardless of player order", () => {
    const first = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 0 }),
        aFakePlayerWith({ PlayerId: "xuid(2)", LastTeamId: 1 }),
      ],
    });
    const second = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(2)", LastTeamId: 1 }),
        aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 0 }),
      ],
    });

    expect(buildTeamRosterSignature(first)).toBe(buildTeamRosterSignature(second));
  });

  it("ignores bots and players not present at the beginning", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 0 }),
        aFakePlayerWith({ PlayerId: "bid(2)", PlayerType: 2, LastTeamId: 1 }),
        aFakePlayerWith({
          PlayerId: "xuid(3)",
          LastTeamId: 1,
          ParticipationInfo: { ...aFakePlayerWith().ParticipationInfo, PresentAtBeginning: false },
        }),
      ],
    });

    expect(buildTeamRosterSignature(matchStats)).toBe("0:1");
  });

  it("returns null when no present-at-beginning real players exist", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [aFakePlayerWith({ PlayerId: "bid(1)", PlayerType: 2, LastTeamId: 0 })],
    });

    expect(buildTeamRosterSignature(matchStats)).toBeNull();
  });
});

describe("analyzeMatchGroupings()", () => {
  it("groups consecutive non-matchmaking matches that share a roster signature", () => {
    expect(
      analyzeMatchGroupings([
        { matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "b", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "c", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
      ]),
    ).toEqual([["a", "b", "c"]]);
  });

  it("does not break on a map or mode change while the roster is unchanged", () => {
    expect(
      analyzeMatchGroupings([
        { matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "b", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
      ]),
    ).toEqual([["a", "b"]]);
  });

  it("breaks the group on a matchmaking match", () => {
    expect(
      analyzeMatchGroupings([
        { matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "b", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "mm", isMatchmaking: true, teamRosterSignature: "0:1|1:2" },
        { matchId: "c", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "d", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
      ]),
    ).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("breaks the group when a roster signature is null", () => {
    expect(
      analyzeMatchGroupings([
        { matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "b", isMatchmaking: false, teamRosterSignature: null },
        { matchId: "c", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "d", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
      ]),
    ).toEqual([["c", "d"]]);
  });

  it("breaks the group when the roster signature changes", () => {
    expect(
      analyzeMatchGroupings([
        { matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "b", isMatchmaking: false, teamRosterSignature: "0:1|1:2" },
        { matchId: "c", isMatchmaking: false, teamRosterSignature: "0:9|1:8" },
        { matchId: "d", isMatchmaking: false, teamRosterSignature: "0:9|1:8" },
      ]),
    ).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops groups with fewer than two matches", () => {
    expect(analyzeMatchGroupings([{ matchId: "a", isMatchmaking: false, teamRosterSignature: "0:1|1:2" }])).toEqual([]);
  });
});

describe("normalizeModeName()", () => {
  it.each([
    ["CTF 3 Captures", "Capture the Flag"],
    ["CTF 5 Captures", "Capture the Flag"],
    ["Squad Multi-Flag CTF", "Capture the Flag"],
    ["Assault:Neutral Bomb Ranked", "Neutral Bomb"],
    ["Assault:Neutral Bomb Squad Ranked", "Neutral Bomb"],
    ["Team Snipers", "Slayer"],
    ["Tactical Slayer", "Slayer"],
    ["Doubles Slayer", "Slayer"],
    ["FFA Slayer", "Slayer"],
    ["Squad Slayer", "Slayer"],
    ["Strongholds", "Strongholds"],
  ])('normalizes "%s" to "%s"', (input, expected) => {
    expect(normalizeModeName(input)).toBe(expected);
  });
});

describe("collapseSequentialSeriesEntries()", () => {
  it("drops an entry when the next entry shares map asset, version and category", () => {
    const entries = [
      { startTime: "2024-11-26T11:00:00.000Z", mapAssetId: "m", mapVersionId: "v", gameVariantCategory: 6 },
      { startTime: "2024-11-26T11:10:00.000Z", mapAssetId: "m", mapVersionId: "v", gameVariantCategory: 6 },
      { startTime: "2024-11-26T11:20:00.000Z", mapAssetId: "m2", mapVersionId: "v", gameVariantCategory: 6 },
    ];

    expect(collapseSequentialSeriesEntries(entries)).toEqual([entries[1], entries[2]]);
  });

  it("sorts entries by start time ascending before collapsing", () => {
    const later = {
      startTime: "2024-11-26T11:20:00.000Z",
      mapAssetId: "m2",
      mapVersionId: "v",
      gameVariantCategory: 6,
    };
    const earlier = {
      startTime: "2024-11-26T11:00:00.000Z",
      mapAssetId: "m1",
      mapVersionId: "v",
      gameVariantCategory: 6,
    };

    expect(collapseSequentialSeriesEntries([later, earlier])).toEqual([earlier, later]);
  });
});
