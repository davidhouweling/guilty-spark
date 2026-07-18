import { describe, expect, it } from "vitest";
import { scanFireEvents, WeaponAttributor } from "../halo-film-type2";
import { buildFireEventBytes } from "./film-fire-event-builder";

describe("scanFireEvents", () => {
  it("returns empty array for empty data", () => {
    expect(scanFireEvents(new Uint8Array(0), 0, 1000)).toEqual([]);
  });

  it("returns empty array when no fire event marker is present", () => {
    expect(scanFireEvents(new Uint8Array(20), 0, 1000)).toEqual([]);
  });

  it("returns empty array when weapon ID is unknown and lacks the common suffix", () => {
    const unknownId = 0xdeadbeefdeadbeefn;
    const data = buildFireEventBytes(0, 0, unknownId);
    expect(scanFireEvents(data, 0, 1000)).toEqual([]);
  });

  it("extracts player index from a valid fire event", () => {
    const brId = 0x2b1824d542c9679fn; // BR75 — known weapon
    const data = buildFireEventBytes(3, 0, brId);
    const events = scanFireEvents(data, 0, 1000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const [ev] = events;
    expect(ev?.playerIndex).toBe(3);
    expect(ev?.weaponName).toBe("BR75");
    expect(ev?.weaponId).toBe(brId);
  });

  it("returns events with unique byte positions", () => {
    const brId = 0x2b1824d542c9679fn;
    const data = buildFireEventBytes(0, 0, brId);
    const events = scanFireEvents(data, 0, 1000);
    const uniqueBytePos = new Set(events.map((e) => e.bytePos));
    expect(uniqueBytePos.size).toBe(events.length);
  });

  it("spreads timestamps linearly when no frame markers are present", () => {
    const brId = 0x2b1824d542c9679fn;
    const data = buildFireEventBytes(0, 0, brId); // 15-byte chunk, no 0xa0 0x7b 0x42 frame marker
    const events = scanFireEvents(data, 1000, 5000); // startMs=1000, durationMs=5000
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Fire event at bytePos 0: timestamp = 1000 + (0/15)*5000 = 1000
    expect(events[0]?.timestampMs).toBe(1000);
  });

  it("accepts a weapon with the common suffix even if not in the known list", () => {
    // Unknown base ID but ends in 0x42C9679F — treated as a valid weapon
    const unknownButCommonSuffix = 0xabcd1234_42c9679fn;
    const data = buildFireEventBytes(1, 0, unknownButCommonSuffix);
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

  it("uses bytePos as tie-breaker when two events share the same estimated timestamp", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 4000, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
      { timestampMs: 4000, playerIndex: 0, weaponId: 0x48c19d2d42c9679fn, weaponName: "MA40 AR", bytePos: 20 },
    ]);
    const result = attributor.claim(0, 5000);
    expect(result?.name).toBe("MA40 AR"); // higher bytePos = later shot in the frame
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

  it("prunes stale events so subsequent claims do not re-scan them", () => {
    const attributor = new WeaponAttributor([
      { timestampMs: 0, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 10 },
      { timestampMs: 8000, playerIndex: 0, weaponId: 0x48c19d2d42c9679fn, weaponName: "MA40 AR", bytePos: 20 },
      { timestampMs: 12000, playerIndex: 0, weaponId: 0x2b1824d542c9679fn, weaponName: "BR75", bytePos: 30 },
    ]);
    // Kill at 7000ms: event at 0ms is outside the 5s window, event at 8000ms is after kill — no match
    expect(attributor.claim(0, 7000)).toBeNull();
    // Kill at 13000ms: event at 8000ms is within window, event at 0ms has been pruned
    const result = attributor.claim(0, 13000);
    expect(result?.name).toBe("BR75"); // 12000ms event wins (closest before 13000ms)
  });
});
