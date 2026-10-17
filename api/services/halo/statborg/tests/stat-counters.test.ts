import { describe, expect, it } from "vitest";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import { counterIncrementTimes, counterTotals, isTeamSlot } from "../stat-counters";

const GRABS = { component: 22, side: "a" } as const;

describe("counterIncrementTimes", () => {
  it("emits one timestamp per unit gained, at the emission that raised the counter", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 1000, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 2500, slot: 10, components: { 22: { a: 3, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([1000, 2500, 2500]);
  });

  it("keeps slots independent and ignores team slots", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 6, components: { 22: { a: 9, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 12, components: { 22: { a: 2, b: 0 } } }),
    ];
    const times = counterIncrementTimes(records, GRABS);
    expect([...times.keys()]).toEqual([10, 12]);
    expect(times.get(12)).toEqual([300, 300]);
  });

  it("reads the requested side of the component", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 23: { a: 0, b: 2 } } })];
    expect(counterIncrementTimes(records, { component: 23, side: "b" }).get(10)).toEqual([100, 100]);
    expect(counterIncrementTimes(records, { component: 23, side: "a" }).get(10)).toEqual([]);
  });

  it("drops negative emissions before choosing the monotone run", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: -115, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 22: { a: 1, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([100]);
  });

  it("keeps the longest non-decreasing run when a parasite value interrupts the series", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 250, slot: 10, components: { 22: { a: 40, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 22: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 400, slot: 10, components: { 22: { a: 3, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([100, 200, 400]);
  });

  it("ignores a trailing parasite jump larger than any real counter step", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 64, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([100]);
  });

  it("dates units gained before the first emission to that emission", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 900, slot: 10, components: { 22: { a: 12, b: 0 } } })];
    expect(counterIncrementTimes(records, GRABS).get(10)).toHaveLength(12);
  });

  it("ignores a first emission beyond any plausible counter", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 900, slot: 10, components: { 22: { a: 5000, b: 0 } } })];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([]);
  });

  it("returns an empty map when no record carries the component", () => {
    const records = [aFakeStatRecordWith({ components: { 2: { a: 1, b: 1 } } })];
    expect(counterIncrementTimes(records, GRABS).size).toBe(0);
  });
});

describe("counterTotals", () => {
  it("counts the units gained per slot", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 4, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 100, slot: 14, components: { 22: { a: 1, b: 0 } } }),
    ];
    expect([...counterTotals(records, GRABS)]).toEqual([
      [10, 4],
      [14, 1],
    ]);
  });
});

describe("isTeamSlot", () => {
  it("treats slots 6 and 8 as teams and 10 upwards as players", () => {
    expect(isTeamSlot(6)).toBe(true);
    expect(isTeamSlot(8)).toBe(true);
    expect(isTeamSlot(10)).toBe(false);
  });
});
