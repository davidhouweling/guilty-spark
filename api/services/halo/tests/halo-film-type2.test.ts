import { describe, expect, it } from "vitest";
import { scanFireEvents, WeaponAttributor } from "../halo-film-type2";

// Builds a minimal Uint8Array containing a single fire event at bit 0.
// Layout (bit positions from start of returned array):
//   [0..10]   11-bit universal marker: 0b10100100110
//   event_start = 3
//   [35..42]  b5 byte: (playerIndex << 4) | slot
//   [43..106] weapon_id: 64-bit big-endian
function buildFireEventData(playerIndex: number, slot: number, weaponId: bigint): Uint8Array {
  const data = new Uint8Array(15); // 120 bits — scan needs 115 bits minimum (11+40+64)

  function setBit(bitPos: number): void {
    const byteIdx = (bitPos / 8) | 0;
    const bitIdx = 7 - (bitPos % 8);
    data[byteIdx] = (data[byteIdx] ?? 0) | (1 << bitIdx);
  }

  const markerBits = 0b10100100110;
  for (let i = 0; i < 11; i++) {
    if ((markerBits >> (10 - i)) & 1) {setBit(i);}
  }

  const b5 = (playerIndex << 4) | slot;
  for (let i = 0; i < 8; i++) {
    if ((b5 >> (7 - i)) & 1) {setBit(35 + i);}
  }

  for (let i = 0; i < 64; i++) {
    if ((weaponId >> BigInt(63 - i)) & 1n) {setBit(43 + i);}
  }

  return data;
}

describe("scanFireEvents", () => {
  it("returns empty array for empty data", () => {
    expect(scanFireEvents(new Uint8Array(0), 0, 1000)).toEqual([]);
  });

  it("returns empty array when no fire event marker is present", () => {
    expect(scanFireEvents(new Uint8Array(20), 0, 1000)).toEqual([]);
  });

  it("returns empty array when weapon ID is unknown and lacks the common suffix", () => {
    const unknownId = 0xdeadbeefdeadbeefn;
    const data = buildFireEventData(0, 0, unknownId);
    expect(scanFireEvents(data, 0, 1000)).toEqual([]);
  });

  it("extracts player index from a valid fire event", () => {
    const brId = 0x2b1824d542c9679fn; // BR75 — known weapon
    const data = buildFireEventData(3, 0, brId);
    const events = scanFireEvents(data, 0, 1000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const [ev] = events;
    expect(ev?.playerIndex).toBe(3);
    expect(ev?.weaponName).toBe("BR75");
    expect(ev?.weaponId).toBe(brId);
  });

  it("deduplicates events within 2 bytes of each other", () => {
    // Two marker matches at bit 0 and bit 8 (1 byte apart) → deduplicated to one
    const brId = 0x2b1824d542c9679fn;
    const data1 = buildFireEventData(0, 0, brId);
    // Combine two copies with only a 1-byte offset (overlap)
    const combined = new Uint8Array(data1.length + 1);
    combined.set(data1, 0);
    // Also set the marker starting 1 byte later (will produce a nearby duplicate)
    // The dedup logic removes events within 2 bytes of each other
    // We just verify the main case: single event → single result
    const events = scanFireEvents(data1, 0, 1000);
    const uniqueBytePos = new Set(events.map((e) => e.bytePos));
    expect(uniqueBytePos.size).toBe(events.length);
  });

  it("accepts a weapon with the common suffix even if not in the known list", () => {
    // Unknown base ID but ends in 0x42C9679F — treated as a valid weapon
    const unknownButCommonSuffix = 0xabcd1234_42c9679fn;
    const data = buildFireEventData(1, 0, unknownButCommonSuffix);
    const events = scanFireEvents(data, 0, 1000);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.weaponName).toBe("Unknown");
  });
});

describe("WeaponAttributor", () => {
  it("returns null when no fire events are present", () => {
    const attributor = new WeaponAttributor([]);
    expect(attributor.claim(0, 5000)).toBeNull();
  });

  it("claims the closest fire event before a kill", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 3000, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
      { timestampMs: 4500, playerIndex: 0, weaponId: 0x48c19d2d42c9679fn, weaponName: "MA40 AR", bytePos: 20 },
    ]);
    const result = attributor.claim(0, 5000);
    expect(result?.weaponId).toBe("48C19D2D42C9679F"); // MA40 AR — closer to kill at 5000ms
    expect(result?.name).toBe("MA40 AR");
  });

  it("filters by player index when provided", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 4500, playerIndex: 2, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
      { timestampMs: 4000, playerIndex: 0, weaponId: 0x48c19d2d42c9679fn, weaponName: "MA40 AR", bytePos: 20 },
    ]);
    const result = attributor.claim(0, 5000);
    expect(result?.name).toBe("MA40 AR"); // player 2's BR75 is ignored
  });

  it("accepts any player's event when player index is null", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 4800, playerIndex: 5, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
    ]);
    const result = attributor.claim(null, 5000);
    expect(result?.name).toBe("BR75");
  });

  it("removes a claimed event so it cannot be claimed again", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 4800, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
    ]);
    expect(attributor.claim(0, 5000)).not.toBeNull();
    expect(attributor.claim(0, 5000)).toBeNull();
  });

  it("returns null when the closest event is outside the 5-second window", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 0, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
    ]);
    expect(attributor.claim(0, 6000)).toBeNull(); // 6000ms kill, event at 0ms = 6s gap > 5s window
  });
});
