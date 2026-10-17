import { describe, expect, it } from "vitest";
import { aFakeCtfMatchStatsWith } from "../fakes/ctf-match-stats.fake";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import { resolveSlotIdentities } from "../slot-identity";
import type { StatRecord } from "../types";

// fixture roster: 0100…=16/17/12, 0200…=22/15/10, 0500…=12/14/8, 0400…=19/16/6
function coreStatsRecords(slot: number, kills: number, deaths: number, assists: number): StatRecord[] {
  return [
    aFakeStatRecordWith({ timestampMs: 100, slot, components: { 2: { a: kills, b: deaths } } }),
    aFakeStatRecordWith({ timestampMs: 100, slot, components: { 3: { a: assists, b: 0 } } }),
  ];
}

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

  it("treats a missing assists component as zero assists", () => {
    const matchStats = aFakeCtfMatchStatsWith(new Map([["0500000000000000", { kills: 3, deaths: 4, assists: 0 }]]));
    const records = [aFakeStatRecordWith({ slot: 16, components: { 2: { a: 3, b: 4 } } })];
    expect(resolveSlotIdentities(records, matchStats).get(16)).toBe("0500000000000000");
  });
});
