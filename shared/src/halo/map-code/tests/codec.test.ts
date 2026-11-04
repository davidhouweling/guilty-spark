import { describe, expect, it } from "vitest";
import { MAP_GENERATOR_COUNTS } from "../../../contracts/individual-tracker/map-generation";
import { HISTORICAL_HCS_MAPS } from "../../hcs";
import { MAP_CODE_MAPS, MAP_CODE_MODES } from "../codebook";
import { decodeMapCode, encodeMapCode, MapCodeError } from "../codec";

describe("map codes", () => {
  it("round-trips the agreed five-match code in its exact order", () => {
    const matches = [
      { mode: "Capture the Flag", map: "Empyrean" },
      { mode: "Slayer", map: "Origin" },
      { mode: "King of the Hill", map: "Live Fire" },
      { mode: "Oddball", map: "Streets" },
      { mode: "Slayer", map: "Recharge" },
    ];
    expect(decodeMapCode("CESOKLOSSR")).toEqual(matches);
    expect(encodeMapCode(matches)).toBe("CESOKLOSSR");
  });

  it("normalizes lowercase codes and surrounding whitespace", () => {
    expect(encodeMapCode(decodeMapCode("  cesoklossr\n"))).toBe("CESOKLOSSR");
  });

  it("extends a five-match code to seven and nine matches by appending pairs", () => {
    const bestOfFive = "CESOKLOSSR";
    const bestOfSeven = `${bestOfFive}OTSD`;
    const bestOfNine = `${bestOfSeven}CFSV`;
    expect(decodeMapCode(bestOfSeven)).toHaveLength(7);
    expect(decodeMapCode(bestOfNine)).toHaveLength(9);
    expect(encodeMapCode(decodeMapCode(bestOfNine))).toBe(bestOfNine);
  });

  it.each(MAP_GENERATOR_COUNTS)("derives a supported match count of %i from code length", (count) => {
    const code = "SL".repeat(count);
    expect(decodeMapCode(code)).toHaveLength(count);
    expect(encodeMapCode(decodeMapCode(code))).toBe(code);
  });

  it.each([
    ["CF", "Capture the Flag", "Forbidden"],
    ["CX", "Capture the Flag", "Fortress"],
    ["CB", "Capture the Flag", "Bazaar"],
    ["BA", "Neutral Bomb", "Aquarius"],
    ["BX", "Neutral Bomb", "Fortress"],
    ["SV", "Slayer", "Vacancy"],
    ["SD", "Slayer", "Solitude"],
    ["SS", "Slayer", "Streets"],
    ["OL", "Oddball", "Live Fire"],
    ["OT", "Oddball", "Lattice"],
  ])("keeps the permanent meaning of %s", (code, mode, map) => {
    expect(decodeMapCode(code)).toEqual([{ mode, map }]);
    expect(encodeMapCode([{ mode, map }])).toBe(code);
  });

  it("round-trips every supported historical combination", () => {
    const matches = Object.entries(HISTORICAL_HCS_MAPS).flatMap(([mode, maps]) => maps.map((map) => ({ mode, map })));
    expect.assertions(matches.length);
    for (const match of matches) {
      expect(decodeMapCode(encodeMapCode([match]))).toEqual([match]);
    }
  });

  it.each(["", " ", "CE-SO", "CE SO", "CE\nSO", "CE1", "M1:CE", "ＣＥ", "ſL"])("rejects non-code input %j", (code) => {
    expect(() => decodeMapCode(code)).toThrow(MapCodeError);
  });

  it.each(["C", "CES", "CESOK"])("rejects an incomplete pair in %s", (code) => {
    expect(() => decodeMapCode(code)).toThrow("Each match needs two characters");
  });

  it.each([2, 4, 6, 8, 10, 12, 14, 100])("rejects an unsupported count of %i in both directions", (count) => {
    expect(() => decodeMapCode("SL".repeat(count))).toThrow("Unsupported match count");
    expect(() => encodeMapCode(Array.from({ length: count }, () => ({ mode: "Slayer", map: "Live Fire" })))).toThrow(
      "Unsupported match count",
    );
  });

  it.each([
    ["ZL", "unknown mode code"],
    ["SZ", "unknown map code"],
    ["OA", "not a supported combination"],
    ["CEOA", "Unsupported match count"],
    ["CESLOA", "Match 3: Oddball on Aquarius"],
  ])("rejects invalid entry %s with a useful error", (code, message) => {
    expect(() => decodeMapCode(code)).toThrow(message);
  });

  it.each([
    { mode: "Oddball", map: "Aquarius" },
    { mode: "Slayer", map: "Unknown" },
    { mode: "Unknown", map: "Live Fire" },
  ])("rejects unsupported names or pairs when encoding $mode on $map", (match) => {
    expect(() => encodeMapCode([match])).toThrow(MapCodeError);
  });

  it("rejects an empty plan when encoding", () => {
    expect(() => encodeMapCode([])).toThrow(MapCodeError);
  });

  it("assigns unique single-letter codes and unique names within each namespace", () => {
    expect.assertions(6);
    for (const codebook of [MAP_CODE_MODES, MAP_CODE_MAPS]) {
      expect(Array.from(codebook.keys()).every((code) => /^[A-Z]$/.test(code))).toBe(true);
      expect(new Set(codebook.values()).size).toBe(codebook.size);
      expect(Array.from(codebook.values()).every((name) => name.length > 0)).toBe(true);
    }
  });
});
