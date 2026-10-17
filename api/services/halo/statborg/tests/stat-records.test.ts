import { describe, expect, it } from "vitest";
import { scanFrameForStatRecords, scanStatRecords } from "../stat-records";
import { aReplicationChunkWith, buildFramePayload } from "./stat-record-builder";

describe("scanFrameForStatRecords", () => {
  it("decodes slot, component indices and both values of a record", () => {
    const payload = buildFramePayload([{ slot: 12, components: [{ index: 2, a: 7, b: 3 }] }]);
    const records = scanFrameForStatRecords(payload, 1234);
    expect(records).toHaveLength(1);
    expect(records[0]?.slot).toBe(12);
    expect(records[0]?.timestampMs).toBe(1234);
    expect(records[0]?.components.get(2)).toEqual({ a: 7, b: 3 });
  });

  it("decodes several components in one record and several records in one frame", () => {
    const payload = buildFramePayload([
      {
        slot: 6,
        components: [
          { index: 0, a: 200, b: 0 },
          { index: 1, a: 0, b: 8420 },
        ],
      },
      { slot: 24, components: [{ index: 22, a: 20, b: 1 }] },
    ]);
    const records = scanFrameForStatRecords(payload, 0);
    expect(records.map((record) => record.slot)).toEqual([6, 24]);
    expect(records[0]?.components.get(0)).toEqual({ a: 200, b: 0 });
    expect(records[0]?.components.get(1)).toEqual({ a: 0, b: 8420 });
    expect(records[1]?.components.get(22)).toEqual({ a: 20, b: 1 });
  });

  it("decodes negative and 32-bit wide values", () => {
    const payload = buildFramePayload([{ slot: 10, components: [{ index: 1, a: -115, b: 70_000 }] }]);
    expect(scanFrameForStatRecords(payload, 0)[0]?.components.get(1)).toEqual({ a: -115, b: 70_000 });
  });

  it("ignores records with odd or out-of-range slots", () => {
    const payload = buildFramePayload([
      { slot: 11, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 26, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 4, components: [{ index: 2, a: 1, b: 1 }] },
    ]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("returns nothing for an empty payload", () => {
    expect(scanFrameForStatRecords(new Uint8Array(0), 0)).toEqual([]);
    expect(scanFrameForStatRecords(new Uint8Array(32), 0)).toEqual([]);
  });
});

describe("scanStatRecords", () => {
  it("dates records from the chunk start plus the frame offset from the first frame", () => {
    const chunk = aReplicationChunkWith(
      [
        { timestampUs: 9_000_000n, records: [{ slot: 10, components: [{ index: 2, a: 1, b: 0 }] }] },
        { timestampUs: 9_250_000n, records: [{ slot: 10, components: [{ index: 2, a: 2, b: 0 }] }] },
      ],
      { startMs: 20_000 },
    );
    expect(scanStatRecords([chunk]).map((record) => record.timestampMs)).toEqual([20_000, 20_250]);
  });

  it("merges chunks in timestamp order", () => {
    const later = aReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 10, components: [{ index: 2, a: 5, b: 0 }] }] }],
      {
        index: 2,
        startMs: 20_000,
      },
    );
    const earlier = aReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 12, components: [{ index: 2, a: 1, b: 0 }] }] }],
      {
        index: 1,
        startMs: 0,
      },
    );
    expect(scanStatRecords([later, earlier]).map((record) => [record.timestampMs, record.slot])).toEqual([
      [0, 12],
      [20_000, 10],
    ]);
  });

  it("returns nothing for chunks without frames", () => {
    expect(scanStatRecords([{ index: 1, startMs: 0, durationMs: 1, data: new Uint8Array(0) }])).toEqual([]);
  });
});
