import { describe, expect, it } from "vitest";
import { aFakeStatRecordWith } from "../fakes/stat-record.fake";
import { filterRecordsByRoundBounds, resolveRoundBounds } from "../round-bounds";
import type { StatRecord } from "../types";

const SLOTS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

function block(slot: number, round: number, timestamps: readonly number[]): StatRecord[] {
  return timestamps.map((timestampMs) => aFakeStatRecordWith({ slot, round, timestampMs }));
}

function everySlot(round: number, timestamps: readonly number[], except: readonly number[] = []): StatRecord[] {
  return SLOTS.filter((slot) => !except.includes(slot)).flatMap((slot) => block(slot, round, timestamps));
}

// each slot leads or trails the consensus by its own offset, as real emissions do
function everySlotStaggered(round: number, firstMs: number, lastMs: number): StatRecord[] {
  return SLOTS.flatMap((slot, index) => block(slot, round, [firstMs + index * 500, lastMs - index * 1_000]));
}

function describeRecords(records: readonly StatRecord[]): string[] {
  return records.map((record) => `${String(record.slot)}:${String(record.round)}@${String(record.timestampMs)}`);
}

describe("resolveRoundBounds", () => {
  it("returns no bounds for an empty film", () => {
    expect(resolveRoundBounds([])).toEqual([]);
  });

  it("leaves a single round unbounded", () => {
    expect(resolveRoundBounds(everySlot(0, [1_000, 400_000, 700_000]))).toEqual([
      { round: 0, startMs: null, endMs: null },
    ]);
  });

  it("ignores a round declared by half the slots or fewer", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...SLOTS.slice(0, 5).flatMap((slot) => block(slot, 1, [770_000])),
      ...block(10, 6, [290_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([{ round: 0, startMs: null, endMs: null }]);
  });

  it("measures the consensus against the fullest round rather than every slot seen", () => {
    const records = [
      ...[10, 12, 14, 16].flatMap((slot) => block(slot, 0, [1_000, 700_000])),
      ...[6, 8, 18, 20, 22].map((slot) => aFakeStatRecordWith({ slot, round: slot % 8, timestampMs: 300_000 })),
    ];
    expect(resolveRoundBounds(records)).toEqual([{ round: 0, startMs: null, endMs: null }]);
  });

  it("always keeps regulation even when fewer slots declare it than a later round", () => {
    const records = [
      ...SLOTS.slice(0, 4).flatMap((slot) => block(slot, 0, [1_000, 700_000])),
      ...everySlot(1, [770_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("ends a round at its last emission before the next round's consensus start and starts the next at its first emission after the earlier round's consensus end", () => {
    const records = [...everySlot(0, [1_000, 700_000]), ...everySlot(1, [770_000, 790_000])];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("keeps the emissions of slots that lead and trail the consensus inside their round", () => {
    const records = [...everySlotStaggered(0, 1_000, 700_000), ...everySlotStaggered(1, 770_000, 800_000)];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("keeps a trailing end-of-round flush inside a short intermission", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(18, 0, [708_000]),
      ...everySlot(1, [712_000, 790_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 708_000 },
      { round: 1, startMs: 712_000, endMs: null },
    ]);
  });

  it("does not let a slot's stray early emission move the edge", () => {
    const records = [...everySlot(0, [1_000, 298_000]), ...block(10, 1, [85_000]), ...everySlot(1, [299_000, 320_000])];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 298_000 },
      { round: 1, startMs: 299_000, endMs: null },
    ]);
  });

  it("does not let a slot's stray late emission move the edge", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(12, 0, [800_000]),
      ...everySlot(1, [770_000, 790_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("still closes the edge when half the slots carry a misdated regulation record", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...SLOTS.slice(0, 5).flatMap((slot) => block(slot, 0, [800_000])),
      ...everySlot(1, [770_000, 790_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("leaves both edges open when most slots carry a misdated regulation record", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...SLOTS.slice(0, 6).flatMap((slot) => block(slot, 0, [800_000])),
      ...everySlot(1, [770_000, 790_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: null },
      { round: 1, startMs: null, endMs: null },
    ]);
  });

  it("leaves both edges open when the rounds overlap", () => {
    const records = [...everySlot(0, [1_000, 800_000]), ...everySlot(1, [770_000, 790_000])];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: null },
      { round: 1, startMs: null, endMs: null },
    ]);
  });

  it("drops a consensus round whose start does not follow the clock", () => {
    const records = [...everySlot(0, [500_000, 700_000]), ...everySlot(1, [100_000, 200_000])];
    expect(resolveRoundBounds(records)).toEqual([{ round: 0, startMs: null, endMs: null }]);
  });

  it("keeps the overtime edge when a chance round declared by most slots starts out of order", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...everySlot(1, [770_000, 790_000]),
      ...SLOTS.slice(0, 6).flatMap((slot) => block(slot, 3, [300_000])),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 770_000, endMs: null },
    ]);
  });

  it("keeps a later round whose consensus start ties the earlier round's", () => {
    const records = [...everySlot(0, [1_000, 700_000]), ...everySlot(1, [1_000, 790_000])];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: null },
      { round: 1, startMs: null, endMs: null },
    ]);
  });

  it("bounds only the separated pair when one pair of a three-round chain overlaps", () => {
    const records = [
      ...everySlot(0, [1_000, 200_000]),
      ...everySlot(1, [300_000, 700_000]),
      ...everySlot(2, [600_000, 800_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 200_000 },
      { round: 1, startMs: 300_000, endMs: null },
      { round: 2, startMs: null, endMs: null },
    ]);
  });

  it("chains three rounds with an edge between each consecutive pair", () => {
    const records = [
      ...everySlot(0, [1_000, 200_000]),
      ...everySlot(1, [300_000, 500_000]),
      ...everySlot(2, [600_000, 800_000]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 200_000 },
      { round: 1, startMs: 300_000, endMs: 500_000 },
      { round: 2, startMs: 600_000, endMs: null },
    ]);
  });
});

describe("filterRecordsByRoundBounds", () => {
  it("keeps every record of a single-round film and drops stray rounds", () => {
    const regulation = everySlot(0, [1_000, 700_000]);
    const records = [...regulation, ...block(10, 6, [290_000]), ...block(22, 7, [500_000])];
    expect(filterRecordsByRoundBounds(records, resolveRoundBounds(records))).toEqual(regulation);
  });

  it("keeps every emission of two rounds whose slots lead and trail the consensus", () => {
    const records = [...everySlotStaggered(0, 1_000, 700_000), ...everySlotStaggered(1, 770_000, 800_000)];
    expect(filterRecordsByRoundBounds(records, resolveRoundBounds(records))).toEqual(records);
  });

  it("keeps a regulation record dated inside the intermission before the overtime consensus start", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(12, 0, [765_000]),
      ...everySlot(1, [770_000, 790_000]),
    ];
    expect(filterRecordsByRoundBounds(records, resolveRoundBounds(records))).toEqual(records);
  });

  it("drops a regulation record dated inside overtime", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(12, 0, [800_000]),
      ...everySlot(1, [770_000, 790_000]),
    ];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(describeRecords(kept)).not.toContain("12:0@800000");
    expect(kept).toHaveLength(records.length - 1);
  });

  it("drops the misdated regulation records of half the slots", () => {
    const strays = SLOTS.slice(0, 5).flatMap((slot) => block(slot, 0, [800_000]));
    const records = [...everySlot(0, [1_000, 700_000]), ...strays, ...everySlot(1, [770_000, 790_000])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(kept).toEqual(records.filter((record) => !strays.includes(record)));
  });

  it("drops an overtime record dated inside regulation", () => {
    const records = [...everySlot(0, [1_000, 298_000]), ...block(10, 1, [85_000]), ...everySlot(1, [299_000, 320_000])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(describeRecords(kept)).not.toContain("10:1@85000");
    expect(kept).toHaveLength(records.length - 1);
  });

  it("drops a slot's whole overtime block when all of it is dated inside regulation", () => {
    const earlyBlock = block(12, 1, [500_000, 505_000]);
    const records = [...everySlot(0, [1_000, 600_000]), ...earlyBlock, ...everySlot(1, [770_000, 790_000], [12])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(kept).toEqual(records.filter((record) => !earlyBlock.includes(record)));
  });

  it("drops every record of a round without bounds", () => {
    const records = [...everySlot(0, [500_000, 700_000]), ...everySlot(1, [100_000, 200_000])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(kept.every((record) => record.round === 0)).toBe(true);
    expect(kept).toHaveLength(SLOTS.length * 2);
  });

  it("preserves record order", () => {
    const records = [...everySlot(0, [1_000, 700_000]), ...everySlot(1, [770_000, 790_000])];
    expect(filterRecordsByRoundBounds(records, resolveRoundBounds(records))).toEqual(records);
  });
});
