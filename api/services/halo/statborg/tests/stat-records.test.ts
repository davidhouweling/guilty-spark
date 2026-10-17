import { describe, expect, it } from "vitest";
import { scanChunkStatRecords, scanFrameForStatRecords, sortStatRecords } from "../stat-records";
import { aFakeReplicationChunkWith, buildFramePayload } from "../fakes/replication-chunk.fake";

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

  it("consumes flagged conditional values so the following component still decodes", () => {
    const payload = buildFramePayload([
      {
        slot: 10,
        components: [
          { index: 1, a: 0, b: 2075, conditionalA: 300, conditionalB: -5 },
          { index: 2, a: 17, b: 12 },
        ],
      },
    ]);
    const [record] = scanFrameForStatRecords(payload, 0);
    expect(record?.components.get(1)).toEqual({ a: 0, b: 2075 });
    expect(record?.components.get(2)).toEqual({ a: 17, b: 12 });
  });

  it("decodes consecutive records without re-matching inside a decoded record", () => {
    const payload = buildFramePayload([
      { slot: 10, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 12, components: [{ index: 2, a: 2, b: 2 }] },
    ]);
    expect(scanFrameForStatRecords(payload, 0).map((record) => record.slot)).toEqual([10, 12]);
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

describe("scanFrameForStatRecords back-to-back records", () => {
  it("accepts a record whose prefix starts exactly where the previous record ended", () => {
    const payload = buildFramePayload(
      [
        { slot: 10, components: [{ index: 2, a: 1, b: 1 }] },
        { slot: 12, components: [{ index: 2, a: 2, b: 2 }] },
      ],
      0,
    );
    expect(scanFrameForStatRecords(payload, 0).map((record) => record.slot)).toEqual([10, 12]);
  });
});

describe("scanChunkStatRecords", () => {
  it("dates records from the chunk start plus the frame offset from the first frame", () => {
    const chunk = aFakeReplicationChunkWith(
      [
        { timestampUs: 9_000_000n, records: [{ slot: 10, components: [{ index: 2, a: 1, b: 0 }] }] },
        { timestampUs: 9_250_000n, records: [{ slot: 10, components: [{ index: 2, a: 2, b: 0 }] }] },
      ],
      { startMs: 20_000 },
    );
    expect(scanChunkStatRecords(chunk).map((record) => record.timestampMs)).toEqual([20_000, 20_250]);
  });

  it("merges chunks in timestamp order", () => {
    const later = aFakeReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 10, components: [{ index: 2, a: 5, b: 0 }] }] }],
      {
        index: 2,
        startMs: 20_000,
      },
    );
    const earlier = aFakeReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 12, components: [{ index: 2, a: 1, b: 0 }] }] }],
      {
        index: 1,
        startMs: 0,
      },
    );
    expect(
      sortStatRecords([...scanChunkStatRecords(later), ...scanChunkStatRecords(earlier)]).map((record) => [
        record.timestampMs,
        record.slot,
      ]),
    ).toEqual([
      [0, 12],
      [20_000, 10],
    ]);
  });

  it("returns nothing for a chunk without frames", () => {
    expect(scanChunkStatRecords({ index: 1, startMs: 0, durationMs: 1, data: new Uint8Array(0) })).toEqual([]);
  });

  it("sorts without mutating the input", () => {
    const records = [
      ...scanChunkStatRecords(
        aFakeReplicationChunkWith([
          {
            timestampUs: 1n,
            records: [
              { slot: 12, components: [{ index: 2, a: 1, b: 0 }] },
              { slot: 10, components: [{ index: 2, a: 1, b: 0 }] },
            ],
          },
        ]),
      ),
    ];
    const sorted = sortStatRecords(records);
    expect(sorted.map((record) => record.slot)).toEqual([10, 12]);
    expect(records.map((record) => record.slot)).toEqual([12, 10]);
  });
});
