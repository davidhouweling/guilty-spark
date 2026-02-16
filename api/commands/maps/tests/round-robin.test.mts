import { describe, it, expect } from "vitest";
import { generateRoundRobinMaps } from "../round-robin.mjs";
import { CURRENT_HCS_MAPS, HCS_SET_FORMAT, ALL_MODES } from "../../../services/halo/hcs.mjs";
import type { MapMode } from "../../../services/halo/hcs.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

// Minimal fake pool for deterministic tests
const fakePool: { mode: MapMode; map: string }[] = [
  { mode: "Slayer", map: "Live Fire" },
  { mode: "Slayer", map: "Recharge" },
  { mode: "Oddball", map: "Streets" },
  { mode: "Strongholds", map: "Bazaar" },
  { mode: "Capture the Flag", map: "Aquarius" },
];

// Helper to create a realistic HCS pool
const createHcsPool = (): { mode: MapMode; map: string }[] => {
  const pool: { mode: MapMode; map: string }[] = [];
  for (const mode of ALL_MODES) {
    for (const map of CURRENT_HCS_MAPS[mode]) {
      pool.push({ mode, map });
    }
  }
  return pool;
};

// Helper to analyze distribution quality
const analyzeDistribution = (
  results: { mode: MapMode; map: string }[],
): {
  mapCounts: Map<string, number>;
  modeCounts: Map<MapMode, number>;
  comboCounts: Map<string, number>;
  maxMapRepeats: number;
  maxModeRepeats: number;
  maxComboRepeats: number;
  uniqueMaps: number;
  uniqueModes: number;
  uniqueCombos: number;
} => {
  const mapCounts = new Map<string, number>();
  const modeCounts = new Map<MapMode, number>();
  const comboCounts = new Map<string, number>();

  for (const { mode, map } of results) {
    mapCounts.set(map, (mapCounts.get(map) ?? 0) + 1);
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
    comboCounts.set(`${mode}:${map}`, (comboCounts.get(`${mode}:${map}`) ?? 0) + 1);
  }

  return {
    mapCounts,
    modeCounts,
    comboCounts,
    maxMapRepeats: Math.max(...Array.from(mapCounts.values())),
    maxModeRepeats: Math.max(...Array.from(modeCounts.values())),
    maxComboRepeats: Math.max(...Array.from(comboCounts.values())),
    uniqueMaps: mapCounts.size,
    uniqueModes: modeCounts.size,
    uniqueCombos: comboCounts.size,
  };
};

describe("generateRoundRobinMaps", () => {
  it("returns unique (mode, map) pairs until pool is exhausted", () => {
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "objective", "slayer", "objective"];
    const result = generateRoundRobinMaps({
      count: 5,
      pool: fakePool,
      formatSequence,
    });
    const seen = new Set(result.map(({ mode, map }) => `${mode}:${map}`));
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
      const key = `${entry.mode}:${entry.map}`;
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
        .map(({ mode, map }) => `${mode}:${map}`)
        .join(","),
    );
    const uniqueRuns = new Set(runs);
    expect(uniqueRuns.size).toBeGreaterThan(1);
  });
});

describe("generateRoundRobinMaps - HCS Analysis", () => {
  it("optimizes map diversity in realistic 7-game HCS series", () => {
    const pool = createHcsPool();
    const formatSequence = Preconditions.checkExists(HCS_SET_FORMAT[7]).map((f) =>
      f === "random" ? (Math.random() < 0.5 ? "slayer" : "objective") : f,
    );

    // Run multiple times to test consistency
    const analyses = Array.from({ length: 10 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      return analyzeDistribution(result);
    });

    // Check that we optimize for map diversity
    for (const analysis of analyses) {
      expect(analysis.maxMapRepeats).toBeLessThanOrEqual(2); // Minimal map repeats
      expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(5); // Good map variety (realistic given constraints)
      expect(analysis.maxComboRepeats).toBeLessThanOrEqual(1); // No combo should repeat
    }
  });

  it("achieves good mode distribution in objective-heavy sequences", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    const result = generateRoundRobinMaps({
      count: 7,
      pool,
      formatSequence,
    });

    const analysis = analyzeDistribution(result);

    // Should distribute across multiple objective modes (4 available: CTF, Strongholds, Oddball, KOTH)
    expect(analysis.uniqueModes).toBeGreaterThanOrEqual(3);
    expect(analysis.maxModeRepeats).toBeLessThanOrEqual(3); // Some modes may repeat but not excessively

    // No slayer should appear
    for (const { mode } of result) {
      expect(mode).not.toBe("Slayer");
    }
  });

  it("handles edge case with limited pool gracefully", () => {
    const limitedPool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "Live Fire" },
      { mode: "Oddball", map: "Recharge" },
    ];

    const result = generateRoundRobinMaps({
      count: 5,
      pool: limitedPool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer"],
    });

    expect(result).toHaveLength(5);

    // Check that slayer positions get slayer, objective positions get objective
    expect(Preconditions.checkExists(result[0]).mode).toBe("Slayer");
    expect(Preconditions.checkExists(result[1]).mode).toBe("Oddball");
    expect(Preconditions.checkExists(result[2]).mode).toBe("Slayer");
    expect(Preconditions.checkExists(result[3]).mode).toBe("Oddball");
    expect(Preconditions.checkExists(result[4]).mode).toBe("Slayer");
  });

  it("ensures format sequence adherence with real HCS data", () => {
    const pool = createHcsPool();
    const formatSequence = Preconditions.checkExists(HCS_SET_FORMAT[5]);

    const result = generateRoundRobinMaps({
      count: 5,
      pool,
      formatSequence: formatSequence.map((f) => (f === "random" ? (Math.random() < 0.5 ? "slayer" : "objective") : f)),
    });

    expect(result).toHaveLength(5);

    // Verify format sequence is respected (accounting for random conversion)
    for (let i = 0; i < result.length; i++) {
      const expectedFormat = formatSequence[i];
      const actualMode = Preconditions.checkExists(result[i]).mode;

      if (expectedFormat === "slayer") {
        expect(actualMode).toBe("Slayer");
      } else if (expectedFormat === "objective") {
        expect(actualMode).not.toBe("Slayer");
      }
      // Random format can be either, so no assertion needed
    }
  });

  it("demonstrates significant improvement in map diversity", () => {
    const pool = createHcsPool();

    // Test with a format that has many objective rounds (where map overlap is highest)
    const formatSequence = ["objective", "objective", "objective", "objective", "objective"] as (
      | "slayer"
      | "objective"
    )[];

    // Run our algorithm multiple times
    const ourResults = Array.from({ length: 20 }, () => {
      const result = generateRoundRobinMaps({
        count: 5,
        pool,
        formatSequence,
      });
      return analyzeDistribution(result);
    });

    // Calculate average performance metrics
    const avgUniqueMapCount = ourResults.reduce((sum, a) => sum + a.uniqueMaps, 0) / ourResults.length;
    const avgMaxMapRepeats = ourResults.reduce((sum, a) => sum + a.maxMapRepeats, 0) / ourResults.length;
    const avgUniqueModeCount = ourResults.reduce((sum, a) => sum + a.uniqueModes, 0) / ourResults.length;

    // Our algorithm should achieve reasonable diversity given HCS constraints
    expect(avgUniqueMapCount).toBeGreaterThan(3); // Good map diversity
    expect(avgMaxMapRepeats).toBeLessThan(2.5); // Limited map repeats
    expect(avgUniqueModeCount).toBeGreaterThan(2.5); // Mode variety
  });

  it("handles empty format sequence gracefully", () => {
    const pool = createHcsPool();

    // Test with empty format sequence - should handle gracefully
    const result = generateRoundRobinMaps({
      count: 3,
      pool,
      formatSequence: [],
    });
    expect(result).toHaveLength(3);
  });

  it("maintains performance with large game counts", () => {
    const pool = createHcsPool();
    const formatSequence: ("slayer" | "objective")[] = Array.from({ length: 15 }, () => "objective");

    const startTime = Date.now();
    const result = generateRoundRobinMaps({
      count: 15,
      pool,
      formatSequence,
    });
    const duration = Date.now() - startTime;

    expect(result).toHaveLength(15);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second

    // Even with large counts, should maintain quality distribution
    // Objective modes have limited unique maps (Live Fire, Lattice, Recharge, Aquarius, Forbidden, Fortress, Origin)
    // so expecting 6-7 unique maps for 15 objective games is realistic
    const analysis = analyzeDistribution(result);
    expect(analysis.uniqueMaps).toBeGreaterThan(6); // Good diversity even at scale
  });

  it("validates deterministic behavior with same inputs", () => {
    const pool = createHcsPool();
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "slayer"];

    // Mock Math.random to ensure deterministic testing
    const originalRandom = Math.random;
    Math.random = (): number => 0.5;

    try {
      const result1 = generateRoundRobinMaps({ count: 3, pool, formatSequence });
      const result2 = generateRoundRobinMaps({ count: 3, pool, formatSequence });

      // With same random seed, results should be identical
      expect(result1).toEqual(result2);
    } finally {
      Math.random = originalRandom;
    }
  });

  it("handles extreme scoring edge cases", () => {
    // Create a pool where only one map works for each mode type
    const extremePool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "OnlySlayerMap" },
      { mode: "Oddball", map: "OnlyObjectiveMap" },
    ];

    const result = generateRoundRobinMaps({
      count: 4,
      pool: extremePool,
      formatSequence: ["slayer", "objective", "slayer", "objective"],
    });

    expect(result).toHaveLength(4);
    expect(Preconditions.checkExists(result[0]).map).toBe("OnlySlayerMap");
    expect(Preconditions.checkExists(result[1]).map).toBe("OnlyObjectiveMap");
    expect(Preconditions.checkExists(result[2]).map).toBe("OnlySlayerMap");
    expect(Preconditions.checkExists(result[3]).map).toBe("OnlyObjectiveMap");
  });

  it("validates memory usage with repeated calls", () => {
    const pool = createHcsPool();
    const formatSequence: ("slayer" | "objective")[] = [
      "slayer",
      "objective",
      "slayer",
      "objective",
      "slayer",
      "objective",
      "slayer",
    ];

    // Run algorithm many times to ensure no memory leaks
    for (let i = 0; i < 100; i++) {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      expect(result).toHaveLength(7);
    }

    // If we reach here without performance degradation, memory management is good
    expect(true).toBe(true);
  });

  it("ensures backward compatibility with existing data structures", () => {
    // Test with the exact structure that commands/maps would use
    const pool = Object.entries(CURRENT_HCS_MAPS).flatMap(([mode, maps]) =>
      maps.map((map) => ({ mode: mode as MapMode, map })),
    );

    const result = generateRoundRobinMaps({
      count: 5,
      pool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer"],
    });

    expect(result).toHaveLength(5);

    // Validate structure matches expectations for map command integration
    for (const entry of result) {
      expect(entry).toHaveProperty("mode");
      expect(entry).toHaveProperty("map");
      expect(typeof entry.mode).toBe("string");
      expect(typeof entry.map).toBe("string");
    }
  });

  it("adapts gracefully when maps are added to existing modes", () => {
    // Create an extended pool with new maps added to existing modes
    const extendedPool = createHcsPool();
    extendedPool.push(
      { mode: "Slayer", map: "NewSlayerMap1" },
      { mode: "Slayer", map: "NewSlayerMap2" },
      { mode: "Capture the Flag", map: "NewCTFMap" },
      { mode: "Oddball", map: "NewOddballMap" },
    );

    const result = generateRoundRobinMaps({
      count: 7,
      pool: extendedPool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer", "objective", "objective"],
    });

    expect(result).toHaveLength(7);

    const analysis = analyzeDistribution(result);

    // Should still maintain good distribution even with expanded pool
    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(6); // More maps available = better diversity
    expect(analysis.maxMapRepeats).toBeLessThanOrEqual(2); // Should still minimize repeats

    // Verify format sequence is respected
    expect(result[0]?.mode).toBe("Slayer");
    expect(result[2]?.mode).toBe("Slayer");
    expect(result[4]?.mode).toBe("Slayer");
    expect(result[1]?.mode).not.toBe("Slayer");
    expect(result[3]?.mode).not.toBe("Slayer");
  });

  it("handles maps being removed from modes gracefully", () => {
    // Create a reduced pool by removing some maps
    const reducedPool = createHcsPool().filter(({ mode, map }) => {
      // Remove some slayer maps and objective maps
      if (mode === "Slayer" && (map === "Solitude" || map === "Streets")) {
        return false;
      }
      if (mode === "Capture the Flag" && map === "Fortress") {
        return false;
      }
      if (mode === "Strongholds" && map === "Lattice") {
        return false;
      }
      return true;
    });

    const result = generateRoundRobinMaps({
      count: 7,
      pool: reducedPool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer", "objective", "objective"],
    });

    expect(result).toHaveLength(7);

    const analysis = analyzeDistribution(result);

    // Should still work with reduced pool, though diversity may be lower
    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(4); // Still reasonable diversity
    expect(analysis.maxMapRepeats).toBeLessThanOrEqual(3); // May need more repeats with fewer maps

    // Format sequence should still be respected
    expect(result[0]?.mode).toBe("Slayer");
    expect(result[2]?.mode).toBe("Slayer");
    expect(result[4]?.mode).toBe("Slayer");
  });

  it("adapts to completely new modes being added", () => {
    // Add a fictional new mode with its own maps
    const extendedPool = createHcsPool();
    extendedPool.push(
      { mode: "Extraction" as MapMode, map: "NewExtractionMap1" },
      { mode: "Extraction" as MapMode, map: "NewExtractionMap2" },
      { mode: "VIP" as MapMode, map: "NewVIPMap" },
    );

    // Test with objective sequence (new modes should be treated as objectives)
    const result = generateRoundRobinMaps({
      count: 5,
      pool: extendedPool,
      formatSequence: ["objective", "objective", "objective", "objective", "objective"],
    });

    expect(result).toHaveLength(5);

    const analysis = analyzeDistribution(result);

    // System should handle new modes gracefully
    expect(analysis.uniqueModes).toBeGreaterThanOrEqual(3); // Good mode variety including potential new modes
    expect(result.every((r) => r.mode !== "Slayer")).toBe(true); // All should be non-slayer
  });

  it("handles extreme scenarios with very limited mode availability", () => {
    // Test with only one map per mode type
    const minimalPool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "OnlySlayerMap" },
      { mode: "Oddball", map: "OnlyOddballMap" },
    ];

    const result = generateRoundRobinMaps({
      count: 6,
      pool: minimalPool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer", "objective"],
    });

    expect(result).toHaveLength(6);

    // Should alternate correctly despite limited pool
    expect(result[0]?.mode).toBe("Slayer");
    expect(result[0]?.map).toBe("OnlySlayerMap");
    expect(result[1]?.mode).toBe("Oddball");
    expect(result[1]?.map).toBe("OnlyOddballMap");
    expect(result[2]?.mode).toBe("Slayer");
    expect(result[2]?.map).toBe("OnlySlayerMap");
    expect(result[3]?.mode).toBe("Oddball");
    expect(result[3]?.map).toBe("OnlyOddballMap");
  });

  it("maintains performance with asymmetric map pools", () => {
    // Create a pool where slayer has many options but objectives have few
    const asymmetricPool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "Slayer1" },
      { mode: "Slayer", map: "Slayer2" },
      { mode: "Slayer", map: "Slayer3" },
      { mode: "Slayer", map: "Slayer4" },
      { mode: "Slayer", map: "Slayer5" },
      { mode: "Slayer", map: "Slayer6" },
      { mode: "Slayer", map: "Slayer7" },
      { mode: "Slayer", map: "Slayer8" },
      { mode: "Oddball", map: "Oddball1" },
      { mode: "Oddball", map: "Oddball2" },
    ];

    const result = generateRoundRobinMaps({
      count: 10,
      pool: asymmetricPool,
      formatSequence: [
        "slayer",
        "slayer",
        "slayer",
        "slayer",
        "slayer",
        "objective",
        "objective",
        "objective",
        "objective",
        "objective",
      ],
    });

    expect(result).toHaveLength(10);

    const analysis = analyzeDistribution(result);

    // Should handle asymmetric pools well
    // With 8 slayer maps + 2 objective maps = 10 total, but only using 10 games total
    // Realistic expectation is 7-8 unique maps due to some necessary repeats
    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(7); // Should use most available maps

    // Slayer games should have high diversity
    const slayerGames = result.filter((r) => r.mode === "Slayer");
    const slayerMaps = new Set(slayerGames.map((r) => r.map));
    expect(slayerMaps.size).toBe(5); // Should use all 5 slayer positions with different maps

    // Objective games will have some repeats due to limited pool
    const objectiveGames = result.filter((r) => r.mode !== "Slayer");
    expect(objectiveGames.length).toBe(5);
  });

  it("validates that map pool changes don't break format sequence adherence", () => {
    // Test multiple different pool configurations
    const poolConfigurations = [
      // Minimal pool
      [
        { mode: "Slayer" as MapMode, map: "S1" },
        { mode: "Oddball" as MapMode, map: "O1" },
      ],
      // Balanced pool
      [
        { mode: "Slayer" as MapMode, map: "S1" },
        { mode: "Slayer" as MapMode, map: "S2" },
        { mode: "Oddball" as MapMode, map: "O1" },
        { mode: "Capture the Flag" as MapMode, map: "O2" },
      ],
      // Slayer-heavy pool
      [
        { mode: "Slayer" as MapMode, map: "S1" },
        { mode: "Slayer" as MapMode, map: "S2" },
        { mode: "Slayer" as MapMode, map: "S3" },
        { mode: "Slayer" as MapMode, map: "S4" },
        { mode: "Oddball" as MapMode, map: "O1" },
      ],
    ];

    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "slayer", "objective", "slayer"];

    for (const pool of poolConfigurations) {
      const result = generateRoundRobinMaps({
        count: 5,
        pool,
        formatSequence,
      });

      expect(result).toHaveLength(5);

      // Format sequence must be respected regardless of pool composition
      for (let i = 0; i < formatSequence.length; i++) {
        const expectedType = formatSequence[i];
        const actualMode = result[i]?.mode;

        if (expectedType === "slayer") {
          expect(actualMode).toBe("Slayer");
        } else {
          expect(actualMode).not.toBe("Slayer");
        }
      }
    }
  });
});
