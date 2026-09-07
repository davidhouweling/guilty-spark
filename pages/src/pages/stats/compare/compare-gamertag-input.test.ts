import { describe, expect, it } from "vitest";
import { parseCompareGamertags } from "./compare-gamertag-input";

describe("parseCompareGamertags()", () => {
  it("returns the trimmed unique gamertags in the order they were supplied", () => {
    const gamertags = parseCompareGamertags([
      "  soundmanD  ",
      "Master Chief",
      "soundmanD",
      "   Master Chief   ",
      "bravo",
    ]);

    expect(gamertags).toEqual(["soundmanD", "Master Chief", "bravo"]);
  });

  it("accepts the supported 2 to 8 player range", () => {
    const gamertags = parseCompareGamertags(["a", "b", "c", "d", "e", "f", "g", "h"]);

    expect(gamertags).toHaveLength(8);
  });

  it("throws when fewer than two valid gamertags are supplied", () => {
    expect(() => parseCompareGamertags(["only-one"])).toThrow("Provide 2 to 8 gamertags to compare.");
  });

  it("throws when more than eight valid gamertags are supplied", () => {
    expect(() => parseCompareGamertags(Array.from({ length: 9 }, (_, index) => `player-${index + 1}`))).toThrow(
      "Provide 2 to 8 gamertags to compare.",
    );
  });

  it("ignores blank gamertag entries before validating the count", () => {
    expect(() => parseCompareGamertags(["", "  ", "alpha", "beta"])).not.toThrow();
    expect(parseCompareGamertags(["", "  ", "alpha", "beta"])).toEqual(["alpha", "beta"]);
  });
});
