import { describe, expect, it } from "vitest";
import { computeStatsHighlightItems } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import { aFakeCondensedMatchHistoryEntryWith } from "../../../services/individual-tracker/fakes/condensed-match-history.fake";
import { prepareCondensedMatchHistory } from "../../../services/individual-tracker/prepare-condensed-match-history";
import { prepareCondensedSearchHighlights } from "../prepare-condensed-search-highlights";

describe("prepareCondensedSearchHighlights", () => {
  it("sums numeric contributions once per match and calculates ratios from totals", () => {
    const first = aFakeCondensedMatchHistoryEntryWith({ matchId: "first" });
    const second = aFakeCondensedMatchHistoryEntryWith({
      matchId: "second",
      outcome: "Loss",
      highlightContribution: {
        kills: 6,
        deaths: 9,
        assists: 2,
        damageDealt: 800,
        damageTaken: 1100,
        headshotKills: 2,
        shotsFired: 300,
        shotsHit: 60,
        totalLifeSeconds: 60,
        totalSpawns: 4,
        totalLifeSpawns: 2,
      },
    });
    const entries = prepareCondensedMatchHistory({
      matches: [first, second, first],
      suggestedGroupings: [],
    }).matches;

    const result = prepareCondensedSearchHighlights(entries);

    expect(result.totals).toEqual({
      kills: 16,
      deaths: 16,
      assists: 6,
      damageDealt: 5000,
      damageTaken: 5000,
      headshotKills: 7,
      shotsFired: 400,
      shotsHit: 110,
      totalLifeSeconds: 300,
      totalSpawns: 12,
      totalLifeSpawns: 10,
    });
    expect(
      computeStatsHighlightItems(result, ["total-games", "matches-win-loss", "accuracy", "avg-life-time"]),
    ).toEqual([
      { label: "Total Games", value: "2" },
      { label: "Won:Loss", value: "1:1" },
      { label: "Accuracy", value: "27.5%" },
      { label: "Avg Life Time", value: "30s" },
    ]);
  });

  it("distinguishes unavailable contributions from valid zero stats", () => {
    const missing = aFakeCondensedMatchHistoryEntryWith({ highlightContribution: null });
    const zero = aFakeCondensedMatchHistoryEntryWith({
      matchId: "zero",
      highlightContribution: {
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        damageTaken: 0,
        headshotKills: 0,
        shotsFired: 0,
        shotsHit: 0,
        totalLifeSeconds: 0,
        totalSpawns: 0,
        totalLifeSpawns: 0,
      },
    });
    const entries = prepareCondensedMatchHistory({ matches: [missing, zero], suggestedGroupings: [] }).matches;
    const unavailable = prepareCondensedSearchHighlights(entries.slice(0, 1));
    const withZero = prepareCondensedSearchHighlights(entries);

    expect(computeStatsHighlightItems(unavailable, ["kills"])[0]?.value).toBe("N/A");
    expect(computeStatsHighlightItems(withZero, ["kills", "accuracy"]).map((item) => item.value)).toEqual(["0", "N/A"]);
  });

  it("preserves chronology and grouping boundaries for series highlights", () => {
    const matches = [
      aFakeCondensedMatchHistoryEntryWith({
        matchId: "newest",
        startTimeIso: "2026-01-01T00:03:00Z",
        teamRosterSignature: "0:a|1:b",
        outcome: "Loss",
      }),
      aFakeCondensedMatchHistoryEntryWith({
        matchId: "boundary",
        startTimeIso: "2026-01-01T00:02:00Z",
        isMatchmaking: true,
      }),
      aFakeCondensedMatchHistoryEntryWith({
        matchId: "middle",
        startTimeIso: "2026-01-01T00:01:00Z",
        teamRosterSignature: "0:b|1:a",
      }),
      aFakeCondensedMatchHistoryEntryWith({
        matchId: "oldest",
        startTimeIso: "2026-01-01T00:00:00Z",
        teamRosterSignature: "0:a|1:b",
      }),
    ];
    const entries = prepareCondensedMatchHistory({ matches, suggestedGroupings: [] }).matches;

    const items = computeStatsHighlightItems(prepareCondensedSearchHighlights(entries), ["series-win-loss"]);

    expect(items).toEqual([{ label: "Series Won:Loss", value: "1:0" }]);
  });
});
