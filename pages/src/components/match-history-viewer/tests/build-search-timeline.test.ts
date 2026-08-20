import { describe, expect, it } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { aFakeMatchHistoryEntryWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { buildSearchTimelineData } from "../build-search-timeline";

const TRACKED_XUID = "1234567890";

function aRawMatchStatsWith(
  matchId: string,
  coreStatsOverrides: Parameters<typeof aFakeCoreStatsWith>[0] = {},
): MatchStats {
  return aFakeMatchStatsWith({
    MatchId: matchId,
    Players: [
      aFakePlayerWith({
        PlayerId: `xuid(${TRACKED_XUID})`,
        LastTeamId: 0,
        PlayerTeamStats: [{ TeamId: 0, Stats: { CoreStats: aFakeCoreStatsWith(coreStatsOverrides) } }],
      }),
    ],
  });
}

describe("buildSearchTimelineData", () => {
  it("converts a standalone match entry into a TrackerMatchSummary", () => {
    const entry = aFakeMatchHistoryEntryWith({
      matchId: "m-1",
      mapName: "Aquarius",
      outcome: "Win",
      isMatchmaking: true,
      matchmakingPlaylist: "Ranked Arena",
      rawMatchStats: aRawMatchStatsWith("m-1", { Kills: 12, Deaths: 8, Assists: 4 }),
    });

    const { matches, series } = buildSearchTimelineData([entry], TRACKED_XUID);

    expect(series).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      matchId: "m-1",
      mapName: "Aquarius",
      outcome: "Win",
      isMatchmaking: true,
      matchmakingPlaylist: "Ranked Arena",
    });
    expect(matches[0]?.killsDeathsAssistsKda).toContain("12:8:4");
  });

  it("falls back to unknown KDA/damage-ratio display when rawMatchStats is missing", () => {
    const entry = aFakeMatchHistoryEntryWith({ matchId: "m-1", rawMatchStats: null });

    const { matches } = buildSearchTimelineData([entry], TRACKED_XUID);

    expect(matches[0]?.killsDeathsAssistsKda).toBe("-:-:- (-)");
    expect(matches[0]?.damageDealtTakenRatio).toBe("-:- (-)");
    expect(matches[0]?.score).toBe("-");
    expect(matches[0]?.teamCount).toBe(0);
  });

  it("groups consecutive custom matches sharing a roster signature into a series", () => {
    // aRawMatchStatsWith always builds a single-player roster (the tracked xuid on team 0), so
    // any two matches built this way share the same buildTeamRosterSignature() output.
    const matchA = aRawMatchStatsWith("m-1", { Kills: 10, Deaths: 5 });
    const matchB = aRawMatchStatsWith("m-2", { Kills: 8, Deaths: 6 });
    const entries = [
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:20:00.000Z",
        rawMatchStats: matchA,
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:00:00.000Z",
        rawMatchStats: matchB,
      }),
    ];

    const { series } = buildSearchTimelineData(entries, TRACKED_XUID);

    expect(series).toHaveLength(1);
    expect(series[0]?.matchIds).toEqual(["m-1", "m-2"]);
    expect(series[0]?.id).toBe("m-1");
    expect(series[0]?.title).toBe("Series");
  });

  it("does not group matchmaking matches into a series even with matching rosters", () => {
    const matchA = aRawMatchStatsWith("m-1");
    const matchB = aRawMatchStatsWith("m-2");
    const entries = [
      aFakeMatchHistoryEntryWith({ matchId: "m-1", isMatchmaking: true, rawMatchStats: matchA }),
      aFakeMatchHistoryEntryWith({ matchId: "m-2", isMatchmaking: true, rawMatchStats: matchB }),
    ];

    const { series } = buildSearchTimelineData(entries, TRACKED_XUID);

    expect(series).toHaveLength(0);
  });
});
