import { describe, expect, it } from "vitest";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import { counterIncrementTimes, counterTotals, isTeamSlot } from "../stat-counters";

const GRABS = { component: 22, side: "a" } as const;

describe("counterIncrementTimes", () => {
  it("emits one timestamp per emission that raised the counter", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 1000, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 2500, slot: 10, components: { 22: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 2600, slot: 10, components: { 22: { a: 2, b: 1 } } }),
      aFakeStatRecordWith({ timestampMs: 4000, slot: 10, components: { 22: { a: 3, b: 1 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([1000, 2500, 4000]);
  });

  it("keeps slots independent and ignores team slots", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 6, components: { 22: { a: 9, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 12, components: { 22: { a: 2, b: 0 } } }),
    ];
    const times = counterIncrementTimes(records, GRABS);
    expect([...times.keys()]).toEqual([10, 12]);
    expect(times.get(12)).toEqual([300]);
  });

  it("reads the requested side of the component", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 23: { a: 0, b: 2 } } })];
    expect(counterIncrementTimes(records, { component: 23, side: "b" }).get(10)).toEqual([100]);
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

  it("resumes emitting after an implausible jump without dating the skipped units", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 22: { a: 14, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 400, slot: 10, components: { 22: { a: 15, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 500, slot: 10, components: { 22: { a: 16, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([100, 200, 400, 500]);
  });

  it("dates only the unit that triggered a first emission above one", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 900, slot: 10, components: { 22: { a: 5, b: 0 } } })];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([900]);
  });

  it("fabricates no timestamps for a first emission beyond a plausible step", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 900, slot: 10, components: { 22: { a: 64, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 950, slot: 10, components: { 22: { a: 65, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([950]);
  });

  it("returns an empty map when no record carries the component", () => {
    const records = [aFakeStatRecordWith({ components: { 2: { a: 1, b: 1 } } })];
    expect(counterIncrementTimes(records, GRABS).size).toBe(0);
  });
});

describe("counterTotals", () => {
  it("reports the final counter value even when emissions were missed", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 2: { a: 4, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 2: { a: 15, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 2: { a: 16, b: 0 } } }),
    ];
    expect(counterTotals(records, { component: 2, side: "a" }).get(10)).toBe(16);
  });

  it("reports null for a slot whose first emission is beyond any plausible counter", () => {
    const records = [aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 2: { a: 7000, b: 0 } } })];
    expect(counterTotals(records, { component: 2, side: "a" }).get(10)).toBeNull();
  });

  it("rejects a parasite that persists through the last emissions", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 2: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 2: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 2: { a: 64, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 400, slot: 10, components: { 2: { a: 64, b: 0 } } }),
    ];
    expect(counterTotals(records, { component: 2, side: "a" }).get(10)).toBe(2);
  });

  it("falls back to the previous value when the last emission is an implausible jump", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 2: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 2: { a: 2, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 2: { a: 64, b: 0 } } }),
    ];
    expect(counterTotals(records, { component: 2, side: "a" }).get(10)).toBe(2);
  });

  it("orders emissions by time before filtering", () => {
    const records = [
      aFakeStatRecordWith({ timestampMs: 300, slot: 10, components: { 22: { a: 3, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 100, slot: 10, components: { 22: { a: 1, b: 0 } } }),
      aFakeStatRecordWith({ timestampMs: 200, slot: 10, components: { 22: { a: 2, b: 0 } } }),
    ];
    expect(counterIncrementTimes(records, GRABS).get(10)).toEqual([100, 200, 300]);
  });

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
