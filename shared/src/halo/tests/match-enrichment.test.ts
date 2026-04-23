import { describe, it, expect } from "vitest";
import { sanitizeMapName, normalizeModeName, getMatchOutcomeLabel } from "../match-enrichment";

describe("sanitizeMapName()", () => {
  it("removes ranked suffix", () => {
    expect(sanitizeMapName("Aquarius - Ranked")).toBe("Aquarius");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeMapName("  Aquarius  ")).toBe("Aquarius");
  });

  it("returns plain name unchanged", () => {
    expect(sanitizeMapName("Aquarius")).toBe("Aquarius");
  });
});

describe("normalizeModeName()", () => {
  it.each([
    ["CTF 3 Captures", "Capture the Flag"],
    ["CTF 5 Captures", "Capture the Flag"],
    ["Assault:Neutral Bomb Ranked", "Neutral Bomb"],
    ["Team Snipers", "Slayer"],
    ["Tactical Slayer", "Slayer"],
    ["Doubles Slayer", "Slayer"],
    ["FFA Slayer", "Slayer"],
    ["Squad Slayer", "Slayer"],
    ["Ranked: Oddball", "Oddball"],
    ["Strongholds", "Strongholds"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeModeName(input)).toBe(expected);
  });
});

describe("getMatchOutcomeLabel()", () => {
  it.each([
    [1, "Tie"],
    [2, "Win"],
    [3, "Loss"],
    [4, "DNF"],
    [null, "Unknown"],
    [99, "Unknown"],
  ])("returns %s for outcome code %s", (outcomeCode, expected) => {
    expect(getMatchOutcomeLabel(outcomeCode)).toBe(expected);
  });
});
