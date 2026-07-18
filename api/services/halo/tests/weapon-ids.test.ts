import { describe, expect, it } from "vitest";
import { lookupWeaponName, weaponIdToHex, hasCommonWeaponSuffix, KNOWN_WEAPON_IDS } from "../weapon-ids";

describe("lookupWeaponName", () => {
  it("returns name for a known weapon ID", () => {
    expect(lookupWeaponName(0x2b1824d542c9679fn)).toBe("BR75");
  });

  it("returns name for an energy sword variant", () => {
    expect(lookupWeaponName(0x4ff3937e42c9679fn)).toBe("Energy Sword");
  });

  it("returns null for an unknown weapon ID", () => {
    expect(lookupWeaponName(0xdeadbeefdeadbeefn)).toBeNull();
  });
});

describe("weaponIdToHex", () => {
  it("formats a weapon ID as 16 uppercase hex chars", () => {
    expect(weaponIdToHex(0x2b1824d542c9679fn)).toBe("2B1824D542C9679F");
  });

  it("pads short IDs to 16 chars", () => {
    expect(weaponIdToHex(0x1n)).toBe("0000000000000001");
  });
});

describe("hasCommonWeaponSuffix", () => {
  it("returns true for a weapon with the common suffix", () => {
    expect(hasCommonWeaponSuffix(0x2b1824d542c9679fn)).toBe(true);
  });

  it("returns false for a weapon with a different suffix", () => {
    expect(hasCommonWeaponSuffix(0x4ff3937e8978aa7an)).toBe(false);
  });
});

describe("KNOWN_WEAPON_IDS", () => {
  it("contains BR75", () => {
    expect(KNOWN_WEAPON_IDS.has(0x2b1824d542c9679fn)).toBe(true);
  });

  it("does not contain an arbitrary ID", () => {
    expect(KNOWN_WEAPON_IDS.has(0xdeadbeefdeadbeefn)).toBe(false);
  });
});
