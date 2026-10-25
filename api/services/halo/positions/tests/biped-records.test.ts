import { describe, expect, it } from "vitest";
import { BipedRecordScanner, slotPrefilters } from "../biped-records";
import { buildBipedFramePayload, FAKE_AXIS_LAYOUT } from "../fakes/position-film.fake";

const slots = new Set([512, 513, 514, 515]);

describe("slotPrefilters", () => {
  it("keeps the prefix bit and the slot bits every slot in a block shares", () => {
    const band = new Set<number>();
    for (let slot = 512; slot <= 575; slot++) {
      band.add(slot);
    }

    expect(slotPrefilters(band)).toEqual([{ bits: 8, value: 0b1_0001000 }]);
  });

  it("splits a band that straddles a power of two into selective blocks", () => {
    const band = new Set<number>();
    for (let slot = 496; slot <= 628; slot++) {
      band.add(slot);
    }

    expect(slotPrefilters(band)).toEqual([
      { bits: 10, value: 0b1_000011111 },
      { bits: 8, value: 0b1_0001000 },
      { bits: 8, value: 0b1_0001001 },
    ]);
  });

  it("matches the whole slot when a block holds a single slot", () => {
    expect(slotPrefilters(new Set([600]))).toEqual([{ bits: 14, value: 2 ** 13 + 600 }]);
  });

  it("has no prefilter for an empty band", () => {
    expect(slotPrefilters(new Set())).toEqual([]);
  });
});

describe("BipedRecordScanner", () => {
  const scanner = new BipedRecordScanner(slots, FAKE_AXIS_LAYOUT);

  it("decodes the slot and quanta of every record in payload order", () => {
    const payload = buildBipedFramePayload([
      { slot: 512, q: [12_000, 11_999, 70_001] },
      { slot: 515, q: [1, 32_766, 131_070], maskCount: 7 },
    ]);

    expect(scanner.scan(payload)).toEqual([
      { slot: 512, q: [12_000, 11_999, 70_001] },
      { slot: 515, q: [1, 32_766, 131_070] },
    ]);
  });

  it("skips records whose gate bits are set", () => {
    const payload = buildBipedFramePayload([
      { slot: 512, q: [12_000, 12_000, 70_000], gate: 0b00100 },
      { slot: 513, q: [12_000, 12_000, 70_000] },
    ]);

    expect(scanner.scan(payload)).toEqual([{ slot: 513, q: [12_000, 12_000, 70_000] }]);
  });

  it("skips records with a saturated axis", () => {
    const payload = buildBipedFramePayload([
      { slot: 512, q: [0, 12_000, 70_000] },
      { slot: 513, q: [12_000, 32_767, 70_000] },
      { slot: 514, q: [12_000, 12_000, 131_071] },
      { slot: 515, q: [12_000, 12_000, 70_000] },
    ]);

    expect(scanner.scan(payload)).toEqual([{ slot: 515, q: [12_000, 12_000, 70_000] }]);
  });

  it("ignores records of slots outside the band", () => {
    const payload = buildBipedFramePayload([{ slot: 600, q: [12_000, 12_000, 70_000] }]);

    expect(scanner.scan(payload)).toEqual([]);
  });

  it("ignores headers whose component mask is malformed", () => {
    const payload = buildBipedFramePayload([
      { slot: 512, q: [12_000, 12_000, 70_000], componentIndices: [0] },
      { slot: 513, q: [12_000, 12_000, 70_000], componentIndices: [1, 2] },
      { slot: 514, q: [12_000, 12_000, 70_000], componentIndices: [0, 0] },
    ]);

    expect(scanner.scan(payload)).toEqual([]);
  });

  it("returns no records without a slot band", () => {
    const payload = buildBipedFramePayload([{ slot: 512, q: [12_000, 12_000, 70_000] }]);

    expect(new BipedRecordScanner(new Set(), FAKE_AXIS_LAYOUT).scan(payload)).toEqual([]);
  });

  it("returns no records for an empty payload", () => {
    expect(scanner.scan(new Uint8Array(0))).toEqual([]);
  });
});
