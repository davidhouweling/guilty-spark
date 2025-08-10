import { describe, it, expect } from "vitest";
import { generateRoundRobinMaps } from "../round-robin.mjs";
import type { MapMode } from "../hcs.mjs";

// Minimal fake pool for deterministic tests
const fakePool: { mode: MapMode; map: string }[] = [
  { mode: "Slayer" as MapMode, map: "Live Fire" },
  { mode: "Slayer" as MapMode, map: "Recharge" },
  { mode: "Oddball" as MapMode, map: "Streets" },
  { mode: "Strongholds" as MapMode, map: "Bazaar" },
  { mode: "CTF" as MapMode, map: "Aquarius" },
];

describe("generateRoundRobinMaps", () => {
  it("returns unique (mode, map) pairs until pool is exhausted", () => {
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "objective", "slayer", "objective"];
    const result = generateRoundRobinMaps({
      count: 5,
      pool: fakePool,
      formatSequence,
    });
    const seen = new Set(result.map(({ mode, map }) => `${String(mode)}:${map}`));
    expect(seen.size).toBe(5);
  });

  it("repeats only after all pairs are used", () => {
    const formatSequence: ("slayer" | "objective")[] = [
      "slayer",
      "objective",
      "objective",
      "slayer",
      "objective",
      "slayer",
      "objective",
    ];
    const result = generateRoundRobinMaps({
      count: 7,
      pool: fakePool,
      formatSequence,
    });
    const seen = new Set<string>();
    let firstRepeat = -1;
    for (let i = 0; i < result.length; i++) {
      const entry = result[i];
      if (!entry) {
        continue;
      }
      const key = `${String(entry.mode)}:${entry.map}`;
      if (seen.has(key)) {
        firstRepeat = i;
        break;
      }
      seen.add(key);
    }
    expect(firstRepeat).toBeGreaterThanOrEqual(5);
  });

  it("adheres to the format sequence (slayer/objective)", () => {
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "objective", "slayer", "objective"];
    const result = generateRoundRobinMaps({
      count: 5,
      pool: fakePool,
      formatSequence,
    });
    for (let i = 0; i < formatSequence.length; i++) {
      const entry = result[i];
      if (!entry) {
        continue;
      }
      if (formatSequence[i] === "slayer") {
        expect(entry.mode).toBe("Slayer");
      } else {
        expect(entry.mode).not.toBe("Slayer");
      }
    }
  });

  it("produces different outputs on multiple runs (randomness)", () => {
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "objective", "slayer", "objective"];
    const runs = Array.from({ length: 5 }, () =>
      generateRoundRobinMaps({
        count: 5,
        pool: fakePool,
        formatSequence,
      })
        .map(({ mode, map }) => `${String(mode)}:${map}`)
        .join(","),
    );
    const uniqueRuns = new Set(runs);
    expect(uniqueRuns.size).toBeGreaterThan(1);
  });
});
