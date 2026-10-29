import { describe, expect, it } from "vitest";
import { aFakeParsedHighlightEventWith } from "../../fakes/parsed-highlight-event.fake";
import { aFakeCtfMatchStatsWith } from "../fakes/ctf-match-stats.fake";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import { resolveSlotIdentities } from "../slot-identity";
import type { ParsedHighlightEvent } from "../../types";
import type { StatRecord } from "../types";

// fixture roster: 0100…=16/17/12, 0200…=22/15/10, 0500…=12/14/8, 0400…=19/16/6
function coreStatsRecords(slot: number, kills: number, deaths: number, assists: number): StatRecord[] {
  return [
    aFakeStatRecordWith({ timestampMs: 100, slot, components: { 2: { a: kills, b: deaths } } }),
    aFakeStatRecordWith({ timestampMs: 100, slot, components: { 3: { a: assists, b: 0 } } }),
  ];
}

function feed(xuid: string, kills: number, deaths: number, timeMs: number): ParsedHighlightEvent[] {
  return [
    ...Array.from({ length: kills }, () => aFakeParsedHighlightEventWith({ xuid, eventType: "kill", timeMs })),
    ...Array.from({ length: deaths }, () => aFakeParsedHighlightEventWith({ xuid, eventType: "death", timeMs })),
  ];
}

// an overtime film: 0100… ends regulation on 14/15/12, then adds 2 kills and 2 deaths the
// counters never record, so the API line reads 16/17/12
const overtimeFeed = [...feed("0100000000000000", 14, 15, 50), ...feed("0100000000000000", 2, 2, 5000)];

describe("resolveSlotIdentities", () => {
  it("resolves a slot whose kills, deaths and assists match exactly one player", () => {
    const records = [...coreStatsRecords(10, 16, 17, 12), ...coreStatsRecords(12, 22, 15, 10)];
    const identities = resolveSlotIdentities(records, aFakeCtfMatchStatsWith());
    expect(identities.get(10)).toBe("0100000000000000");
    expect(identities.get(12)).toBe("0200000000000000");
  });

  it("leaves a slot unresolved when no player matches its triplet", () => {
    const identities = resolveSlotIdentities(coreStatsRecords(10, 99, 0, 0), aFakeCtfMatchStatsWith());
    expect(identities.has(10)).toBe(false);
  });

  it("leaves a slot unresolved when two players share its triplet", () => {
    const matchStats = aFakeCtfMatchStatsWith(
      new Map([
        ["0100000000000000", { kills: 5, deaths: 5, assists: 5 }],
        ["0200000000000000", { kills: 5, deaths: 5, assists: 5 }],
      ]),
    );
    expect(resolveSlotIdentities(coreStatsRecords(10, 5, 5, 5), matchStats).has(10)).toBe(false);
  });

  it("drops a player claimed by two slots", () => {
    const records = [...coreStatsRecords(10, 16, 17, 12), ...coreStatsRecords(14, 16, 17, 12)];
    const identities = resolveSlotIdentities(records, aFakeCtfMatchStatsWith());
    expect(identities.size).toBe(0);
  });

  it("sums a player's stats across every team entry", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    const player = matchStats.Players.find((candidate) => candidate.PlayerId === "xuid(0100000000000000)");
    const firstEntry = player?.PlayerTeamStats[0];
    if (player == null || firstEntry == null) {
      throw new Error("fixture player missing");
    }
    player.PlayerTeamStats.push({
      ...structuredClone(firstEntry),
      TeamId: 1,
      Stats: {
        ...structuredClone(firstEntry.Stats),
        CoreStats: { ...firstEntry.Stats.CoreStats, Kills: 4, Deaths: 1, Assists: 0 },
      },
    });
    expect(resolveSlotIdentities(coreStatsRecords(10, 20, 18, 12), matchStats).get(10)).toBe("0100000000000000");
  });

  it("resolves a player who never emitted kills or deaths by assists alone", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["0900000000000000", { kills: 0, deaths: 0, assists: 6 }]]));
    const records = [aFakeStatRecordWith({ slot: 18, components: { 3: { a: 6, b: 0 } } })];
    expect(resolveSlotIdentities(records, matchStats).get(18)).toBe("0900000000000000");
  });

  it("leaves a slot unresolved when its kill counter was rejected as implausible", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["0900000000000000", { kills: 0, deaths: 0, assists: 6 }]]));
    const records = [
      aFakeStatRecordWith({ slot: 18, components: { 2: { a: 7000, b: 0 } } }),
      aFakeStatRecordWith({ slot: 18, components: { 3: { a: 6, b: 0 } } }),
    ];
    expect(resolveSlotIdentities(records, matchStats).has(18)).toBe(false);
  });

  it("resolves a player with no kills, deaths or assists from any other emission", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["1200000000000000", { kills: 0, deaths: 0, assists: 0 }]]));
    const records = [aFakeStatRecordWith({ slot: 24, components: { 22: { a: 2, b: 0 } } })];
    expect(resolveSlotIdentities(records, matchStats).get(24)).toBe("1200000000000000");
  });

  it("leaves a slot unresolved when its kill counter only ever emitted negative values", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["0900000000000000", { kills: 0, deaths: 0, assists: 6 }]]));
    const records = [
      aFakeStatRecordWith({ slot: 18, components: { 2: { a: -115, b: 0 } } }),
      aFakeStatRecordWith({ slot: 18, components: { 3: { a: 6, b: 0 } } }),
    ];
    expect(resolveSlotIdentities(records, matchStats).has(18)).toBe(false);
  });

  it("treats a missing assists component as zero assists", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["0500000000000000", { kills: 3, deaths: 4, assists: 0 }]]));
    const records = [aFakeStatRecordWith({ slot: 16, components: { 2: { a: 3, b: 4 } } })];
    expect(resolveSlotIdentities(records, matchStats).get(16)).toBe("0500000000000000");
  });

  it("matches a slot the whole-match line rejects against the player's kills and deaths when the records stopped", () => {
    const identities = resolveSlotIdentities(coreStatsRecords(10, 14, 15, 12), aFakeCtfMatchStatsWith(), overtimeFeed);
    expect(identities.get(10)).toBe("0100000000000000");
  });

  it("keeps the whole-match matches and only matches the leftover slots at the cut-off", () => {
    const records = [...coreStatsRecords(10, 14, 15, 12), ...coreStatsRecords(12, 22, 15, 10)];
    const identities = resolveSlotIdentities(records, aFakeCtfMatchStatsWith(), [
      ...overtimeFeed,
      ...feed("0200000000000000", 14, 15, 50),
    ]);
    expect(identities.get(10)).toBe("0100000000000000");
    expect(identities.get(12)).toBe("0200000000000000");
  });

  it("accepts fewer assists at the cut-off than the whole match but never more", () => {
    const fewer = resolveSlotIdentities(coreStatsRecords(10, 14, 15, 11), aFakeCtfMatchStatsWith(), overtimeFeed);
    const more = resolveSlotIdentities(coreStatsRecords(10, 14, 15, 13), aFakeCtfMatchStatsWith(), overtimeFeed);
    expect(fewer.get(10)).toBe("0100000000000000");
    expect(more.has(10)).toBe(false);
  });

  it("leaves the cut-off match alone when the records run to the feed's last kill or death", () => {
    const identities = resolveSlotIdentities(
      coreStatsRecords(10, 14, 15, 12),
      aFakeCtfMatchStatsWith(),
      feed("0100000000000000", 14, 15, 50),
    );
    expect(identities.has(10)).toBe(false);
  });

  it("leaves the cut-off match alone without a feed", () => {
    expect(resolveSlotIdentities(coreStatsRecords(10, 14, 15, 12), aFakeCtfMatchStatsWith()).has(10)).toBe(false);
  });

  it("counts a kill or death landing just after the last record as recorded", () => {
    const identities = resolveSlotIdentities(coreStatsRecords(10, 14, 15, 12), aFakeCtfMatchStatsWith(), [
      ...feed("0100000000000000", 13, 15, 50),
      ...feed("0100000000000000", 1, 0, 150),
      ...feed("0100000000000000", 2, 2, 5000),
    ]);
    expect(identities.get(10)).toBe("0100000000000000");
  });

  it("leaves a slot unresolved when two players share its kills and deaths at the cut-off", () => {
    const identities = resolveSlotIdentities(coreStatsRecords(10, 14, 15, 10), aFakeCtfMatchStatsWith(), [
      ...overtimeFeed,
      ...feed("0200000000000000", 14, 15, 50),
      ...feed("0200000000000000", 8, 0, 5000),
    ]);
    expect(identities.has(10)).toBe(false);
  });
});
