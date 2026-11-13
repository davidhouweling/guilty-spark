import { describe, expect, it } from "vitest";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupTitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import { aFakePreparedMatchHistoryEntryWith as aFakeMatchHistoryEntryWith } from "../../../services/individual-tracker/fakes/condensed-match-history.fake";
import { buildSearchTimelineData } from "../build-search-timeline";

describe("buildSearchTimelineData", () => {
  it("converts a standalone match entry into a TrackerMatchSummary", () => {
    const entry = aFakeMatchHistoryEntryWith({
      matchId: "m-1",
      mapName: "Aquarius",
      outcome: "Win",
      isMatchmaking: true,
      matchmakingPlaylist: "Ranked Arena",
      trackedPlayerSummary: { kills: 12, deaths: 8, assists: 4, damageDealt: 4200, damageTaken: 3900 },
    });

    const { matches, series } = buildSearchTimelineData([entry]);

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

  it("falls back to unknown KDA/damage-ratio display when summary is unavailable", () => {
    const entry = aFakeMatchHistoryEntryWith({
      matchId: "m-1",
      trackedPlayerSummary: null,
      score: null,
      teamCount: null,
    });

    const { matches } = buildSearchTimelineData([entry]);

    expect(matches[0]?.killsDeathsAssistsKda).toBe("-:-:- (-)");
    expect(matches[0]?.damageDealtTakenRatio).toBe("-:- (-)");
    expect(matches[0]?.score).toBe("-");
    expect(matches[0]?.teamCount).toBe(0);
  });

  it("sorts matches newest-first regardless of input order", () => {
    const entries = [
      aFakeMatchHistoryEntryWith({ matchId: "m-older", startTimeIso: "2026-01-01T00:00:00.000Z" }),
      aFakeMatchHistoryEntryWith({ matchId: "m-newer", startTimeIso: "2026-01-01T00:20:00.000Z" }),
    ];

    const { matches } = buildSearchTimelineData(entries);

    expect(matches.map((match) => match.matchId)).toEqual(["m-newer", "m-older"]);
  });

  it("appends an older 'Load more' page to the end of the newest-first list, next to the button that fetched it", () => {
    const firstPage = [aFakeMatchHistoryEntryWith({ matchId: "m-newest", startTimeIso: "2026-01-01T00:20:00.000Z" })];
    const afterLoadMore = [
      ...firstPage,
      aFakeMatchHistoryEntryWith({ matchId: "m-oldest", startTimeIso: "2026-01-01T00:00:00.000Z" }),
    ];

    const { matches } = buildSearchTimelineData(afterLoadMore);

    expect(matches.map((match) => match.matchId)).toEqual(["m-newest", "m-oldest"]);
  });

  it("groups consecutive custom matches sharing a roster signature into a series with a stable, member-set-derived id", () => {
    const entries = [
      // Listed newest-first (as getMatchHistory returns), to prove the function re-sorts.
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:20:00.000Z",
        trackedPlayerSummary: { kills: 10, deaths: 5, assists: 3, damageDealt: 1000, damageTaken: 500 },
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:00:00.000Z",
        trackedPlayerSummary: { kills: 8, deaths: 6, assists: 6, damageDealt: 900, damageTaken: 500 },
      }),
    ];

    const { series } = buildSearchTimelineData(entries);

    expect(series).toHaveLength(1);
    expect(series[0]?.matchIds).toEqual(["m-2", "m-1"]);
    expect(series[0]?.id).toBe(`series:${buildSeriesGroupKey(["m-1", "m-2"])}`);
    expect(series[0]?.title).toBe(getDefaultSeriesGroupTitle());
    expect(series[0]?.killsDeathsAssistsKda).toBe("18:11:9 (1.91)");
    expect(series[0]?.damageDealtTakenRatio).toBe("1,900:1,000 (1.9)");
  });

  it("uses unknown series metrics when a member is unavailable and counts duplicate IDs only once", () => {
    const first = aFakeMatchHistoryEntryWith({ matchId: "m-1", startTimeIso: "2026-01-01T00:00:00Z" });
    const missing = aFakeMatchHistoryEntryWith({
      matchId: "m-2",
      startTimeIso: "2026-01-01T00:01:00Z",
      trackedPlayerSummary: null,
    });
    const { matches, series } = buildSearchTimelineData([first, missing, first]);

    expect(matches.map((match) => match.matchId)).toEqual(["m-2", "m-1"]);
    expect(series[0]?.matchIds).toEqual(["m-1", "m-2"]);
    expect(series[0]?.killsDeathsAssistsKda).toBe("N/A");
    expect(series[0]?.damageDealtTakenRatio).toBe("N/A");
  });

  it("renders zero player metrics as zero rather than unavailable", () => {
    const entry = aFakeMatchHistoryEntryWith({
      trackedPlayerSummary: { kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0 },
    });
    expect(buildSearchTimelineData([entry]).matches[0]?.killsDeathsAssistsKda).toBe("0:0:0 (0)");
  });

  it("keeps the series id stable across pagination even though the member array order can shift", () => {
    // buildSeriesGroupKey normalizes/sorts the member ids, so the id doesn't depend on which
    // match happens to sort first — unlike using matchIds[0] as the id, which would change
    // whenever a newly-loaded older page inserts a match ahead of the existing anchor.
    const firstPageOrder = buildSearchTimelineData([
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:20:00.000Z",
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    const reorderedAfterLoadMore = buildSearchTimelineData([
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:00:00.000Z",
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        isMatchmaking: false,
        startTimeIso: "2026-01-01T00:20:00.000Z",
      }),
    ]);

    expect(firstPageOrder.series[0]?.id).toBe(reorderedAfterLoadMore.series[0]?.id);
  });

  it("does not group matchmaking matches into a series even with matching rosters", () => {
    const entries = [
      aFakeMatchHistoryEntryWith({ matchId: "m-1", isMatchmaking: true }),
      aFakeMatchHistoryEntryWith({ matchId: "m-2", isMatchmaking: true }),
    ];

    const { series } = buildSearchTimelineData(entries);

    expect(series).toHaveLength(0);
  });

  it("groups side swaps but stops at a missing roster boundary", () => {
    const entries = [
      aFakeMatchHistoryEntryWith({
        matchId: "a",
        startTimeIso: "2026-01-01T00:00:00Z",
        teamRosterSignature: "0:a|1:b",
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "b",
        startTimeIso: "2026-01-01T00:01:00Z",
        teamRosterSignature: "0:b|1:a",
      }),
      aFakeMatchHistoryEntryWith({ matchId: "c", startTimeIso: "2026-01-01T00:02:00Z", teamRosterSignature: null }),
      aFakeMatchHistoryEntryWith({
        matchId: "d",
        startTimeIso: "2026-01-01T00:03:00Z",
        teamRosterSignature: "0:a|1:b",
      }),
    ];

    expect(buildSearchTimelineData(entries).series.map((series) => series.matchIds)).toEqual([["a", "b"]]);
  });
});
