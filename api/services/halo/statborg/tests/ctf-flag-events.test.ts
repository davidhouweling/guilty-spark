import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { GameVariantCategory } from "halo-infinite-api";
import { assertCtfMatchSupported, buildCtfFlagEventsFromRecords } from "../ctf-flag-events";
import { aFakeCtfMatchStatsWith } from "../fakes/ctf-match-stats.fake";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import type { StatRecord } from "../types";

// fixture roster: 0100… (team 0) = 16/17/12, 0400… (team 1) = 19/16/6
function identityRecords(slot: number, kills: number, deaths: number, assists: number): StatRecord[] {
  return [
    aFakeStatRecordWith({ timestampMs: 50, slot, components: { 2: { a: kills, b: deaths } } }),
    aFakeStatRecordWith({ timestampMs: 50, slot, components: { 3: { a: assists, b: 0 } } }),
  ];
}

describe("buildCtfFlagEventsFromRecords", () => {
  it("names each counter increment as a flag event attributed to the resolved player and team", () => {
    const records = [
      ...identityRecords(10, 16, 17, 12),
      ...identityRecords(24, 19, 16, 6),
      aFakeStatRecordWith({ timestampMs: 54_879, slot: 24, components: { 24: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 56_080, slot: 24, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 60_000, slot: 10, components: { 23: { a: 1, b: 1 } } }),
      aFakeStatRecordWith({ timestampMs: 61_000, slot: 10, components: { 21: { a: 1, b: 1 } } }),
      aFakeStatRecordWith({ timestampMs: 61_000, slot: 24, components: { 20: { a: 0, b: 1 } } }),
      aFakeStatRecordWith({ timestampMs: 62_000, slot: 24, components: { 22: { a: 1, b: 1 } } }),
    ];
    const { events, unresolvedSlots } = buildCtfFlagEventsFromRecords(records, aFakeCtfMatchStatsWith());
    expect(unresolvedSlots).toEqual([]);
    expect(events).toEqual([
      { timestampMs: 54_879, kind: "steal", xuid: "0400000000000000", teamId: 1 },
      { timestampMs: 56_080, kind: "grab", xuid: "0400000000000000", teamId: 1 },
      { timestampMs: 60_000, kind: "return", xuid: "0100000000000000", teamId: 0 },
      { timestampMs: 60_000, kind: "secure", xuid: "0100000000000000", teamId: 0 },
      { timestampMs: 61_000, kind: "capture", xuid: "0100000000000000", teamId: 0 },
      { timestampMs: 61_000, kind: "carrierKilled", xuid: "0100000000000000", teamId: 0 },
      { timestampMs: 61_000, kind: "captureAssist", xuid: "0400000000000000", teamId: 1 },
      { timestampMs: 62_000, kind: "returnerKilled", xuid: "0400000000000000", teamId: 1 },
    ]);
  });

  it("reports slots that gained flag counters but could not be attributed", () => {
    const records = [
      ...identityRecords(10, 16, 17, 12),
      aFakeStatRecordWith({ timestampMs: 100, slot: 18, components: { 22: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 100, slot: 20, components: { 22: { a: 0, b: 0 } } }),
    ];
    const { events, unresolvedSlots } = buildCtfFlagEventsFromRecords(records, aFakeCtfMatchStatsWith());
    expect(events).toEqual([]);
    expect(unresolvedSlots).toEqual([18]);
  });

  it("returns no events for an empty record set", () => {
    expect(buildCtfFlagEventsFromRecords([], aFakeCtfMatchStatsWith())).toEqual({ events: [], unresolvedSlots: [] });
  });
});

describe("assertCtfMatchSupported", () => {
  it("accepts a CTF match with eight starting players", () => {
    expect(() => {
      assertCtfMatchSupported(aFakeCtfMatchStatsWith());
    }).not.toThrow();
  });

  it("refuses a match that is not CTF", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    matchStats.MatchInfo.GameVariantCategory = GameVariantCategory.MultiplayerSlayer;
    expect(() => {
      assertCtfMatchSupported(matchStats);
    }).toThrow("is not CTF");
  });

  it("refuses lobbies that started with more than eight players", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    matchStats.Players.push(structuredClone(Preconditions.checkExists(matchStats.Players[0])));
    expect(() => {
      assertCtfMatchSupported(matchStats);
    }).toThrow("at most 8 players");
  });

  it("tolerates a mid-match substitute who was not present at the start", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    const substitute = structuredClone(Preconditions.checkExists(matchStats.Players[0]));
    substitute.ParticipationInfo.PresentAtBeginning = false;
    matchStats.Players.push(substitute);
    expect(() => {
      assertCtfMatchSupported(matchStats);
    }).not.toThrow();
  });
});
