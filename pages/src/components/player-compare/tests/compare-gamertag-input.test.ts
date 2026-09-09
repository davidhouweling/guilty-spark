import { describe, expect, it } from "vitest";
import { cleanCompareGamertags, parseCompareGamertags } from "../compare-gamertag-input";

describe("cleanCompareGamertags()", () => {
  it("trims entries and removes blank values before routing decisions", () => {
    expect(cleanCompareGamertags(["", "  Alpha  ", "   "])).toEqual(["Alpha"]);
  });
});

describe("parseCompareGamertags()", () => {
  it("returns the trimmed unique gamertags in the order they were supplied", () => {
    const gamertags = parseCompareGamertags([
      "  soundmanD  ",
      "Master Chief",
      "SOUNDMAND",
      "   Master Chief   ",
      "bravo",
    ]);

    expect(gamertags).toEqual(["soundmanD", "Master Chief", "bravo"]);
  });

  it("accepts the supported 1 to 8 player range", () => {
    const gamertags = parseCompareGamertags(["a", "b", "c", "d", "e", "f", "g", "h"]);

    expect(gamertags).toHaveLength(8);
  });

  it("returns a single valid gamertag", () => {
    expect(parseCompareGamertags(["only-one"])).toEqual(["only-one"]);
  });

  it("throws when no valid gamertags are supplied", () => {
    expect(() => parseCompareGamertags([])).toThrow("Provide 1 to 8 gamertags to compare.");
  });

  it("throws when more than eight valid gamertags are supplied", () => {
    expect(() => parseCompareGamertags(Array.from({ length: 9 }, (_, index) => `player-${String(index + 1)}`))).toThrow(
      "Provide 1 to 8 gamertags to compare.",
    );
  });

  it("ignores blank gamertag entries before validating the count", () => {
    expect(() => parseCompareGamertags(["", "  ", "alpha", "beta"])).not.toThrow();
    expect(parseCompareGamertags(["", "  ", "alpha", "beta"])).toEqual(["alpha", "beta"]);
  });
});