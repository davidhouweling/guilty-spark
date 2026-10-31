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

  it("closes the gap between two rounds at their last and first emissions", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(10, 1, [760_000, 790_000]),
      ...block(12, 1, [760_000, 790_000]),
      ...everySlot(1, [770_000, 790_000], [10, 12]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 700_000 },
      { round: 1, startMs: 760_000, endMs: null },
    ]);
  });

  it("ignores a slot's first emission that precedes the earlier round's consensus end", () => {
    const records = [
      ...everySlot(0, [1_000, 298_000]),
      ...block(10, 1, [85_000, 300_000, 320_000]),
      ...block(12, 1, [85_000, 300_000, 320_000]),
      ...everySlot(1, [299_000, 320_000], [10, 12]),
    ];
    expect(resolveRoundBounds(records)).toEqual([
      { round: 0, startMs: null, endMs: 298_000 },
      { round: 1, startMs: 299_000, endMs: null },
    ]);
  });

  it("ignores a slot's last emission that follows the later round's consensus start", () => {
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

  it("keeps every emission of two rounds separated by a gap", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(10, 1, [760_000, 790_000]),
      ...everySlot(1, [770_000, 790_000], [10]),
    ];
    expect(filterRecordsByRoundBounds(records, resolveRoundBounds(records))).toEqual(records);
  });

  it("drops a regulation record dated inside overtime when its slot has regulation records in the window", () => {
    const records = [
      ...everySlot(0, [1_000, 700_000]),
      ...block(12, 0, [800_000]),
      ...everySlot(1, [770_000, 790_000]),
    ];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(describeRecords(kept)).not.toContain("12:0@800000");
    expect(kept).toHaveLength(records.length - 1);
  });

  it("drops an overtime record dated inside regulation when its slot has overtime records in the window", () => {
    const records = [...everySlot(0, [1_000, 298_000]), ...block(10, 1, [85_000]), ...everySlot(1, [299_000, 320_000])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(describeRecords(kept)).not.toContain("10:1@85000");
    expect(kept).toHaveLength(records.length - 1);
  });

  it("keeps a block that lies entirely outside its round's window", () => {
    const earlyBlock = block(12, 1, [500_000, 505_000]);
    const records = [...everySlot(0, [1_000, 600_000]), ...earlyBlock, ...everySlot(1, [770_000, 790_000], [12])];
    const kept = filterRecordsByRoundBounds(records, resolveRoundBounds(records));
    expect(describeRecords(kept)).toEqual(expect.arrayContaining(describeRecords(earlyBlock)));
    expect(kept).toHaveLength(records.length);
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
