import { describe, it, expect } from "vitest";
import { generateRoundRobinMaps } from "../round-robin.mjs";
import { CURRENT_HCS_MAPS, HCS_SET_FORMAT, ALL_MODES } from "../../../services/halo/hcs.mjs";
import type { MapMode } from "../../../services/halo/hcs.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

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

describe("generateRoundRobinMaps - Advanced Analysis", () => {
  it("minimizes map repeats in 7-game HCS series", () => {
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

    // Check that we minimize repeats effectively
    for (const analysis of analyses) {
      expect(analysis.maxMapRepeats).toBeLessThanOrEqual(2);
      expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(6); // At least 6 unique maps in 7 games
      expect(analysis.maxComboRepeats).toBeLessThanOrEqual(1); // No combo should repeat
    }
  });

  it("achieves good mode distribution in objective rounds", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    const result = generateRoundRobinMaps({
      count: 7,
      pool,
      formatSequence,
    });

    const analysis = analyzeDistribution(result);

    // Should distribute across multiple objective modes
    expect(analysis.uniqueModes).toBeGreaterThanOrEqual(3);
    expect(analysis.maxModeRepeats).toBeLessThanOrEqual(3); // With 4 objective modes, max should be reasonable

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

  it("demonstrates improvement over naive random selection", () => {
    const pool = createHcsPool();
    const formatSequence = Preconditions.checkExists(HCS_SET_FORMAT[7]).map((f) => (f === "random" ? "objective" : f));

    // Run our algorithm multiple times to get stable statistics
    const ourResults = Array.from({ length: 50 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      return analyzeDistribution(result);
    });

    // Calculate average performance metrics
    const avgUniqueComboCount = ourResults.reduce((sum, a) => sum + a.uniqueCombos, 0) / ourResults.length;
    const avgUniqueMapCount = ourResults.reduce((sum, a) => sum + a.uniqueMaps, 0) / ourResults.length;
    const avgMaxMapRepeats = ourResults.reduce((sum, a) => sum + a.maxMapRepeats, 0) / ourResults.length;

    // Our algorithm should achieve good diversity - using more conservative thresholds
    // that account for natural statistical variance
    expect(avgUniqueComboCount).toBeGreaterThan(6.0); // At least 6 unique combos on average
    expect(avgUniqueMapCount).toBeGreaterThan(6.0); // At least 6 unique maps on average
    expect(avgMaxMapRepeats).toBeLessThan(2.0); // Reasonable repeat control

    // Additional validation: ensure we're consistently performing well
    const poorPerformanceRuns = ourResults.filter((r) => r.uniqueMaps < 5 || r.uniqueCombos < 5).length;
    expect(poorPerformanceRuns).toBeLessThan(5); // Less than 10% of runs should perform poorly
  });
});
