import { describe, it, expect } from "vitest";
import { generateRoundRobinMaps } from "../round-robin.mjs";
import { CURRENT_HCS_MAPS, ALL_MODES } from "../../../services/halo/hcs.mjs";
import type { MapMode } from "../../../services/halo/hcs.mjs";

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

// Helper to analyze consecutive patterns
const analyzeConsecutivePatterns = (
  results: { mode: MapMode; map: string }[],
): {
  consecutiveModes: { mode: MapMode; count: number; positions: number[] }[];
  consecutiveMaps: { map: string; count: number; positions: number[] }[];
} => {
  const consecutiveModes: { mode: MapMode; count: number; positions: number[] }[] = [];
  const consecutiveMaps: { map: string; count: number; positions: number[] }[] = [];

  if (results.length === 0) {
    return { consecutiveModes, consecutiveMaps };
  }

  let currentModeStreak = 1;
  let currentMapStreak = 1;
  const [firstResult] = results;
  if (!firstResult) {
    return { consecutiveModes, consecutiveMaps };
  }
  let currentMode = firstResult.mode;
  let currentMap = firstResult.map;

  for (let i = 1; i < results.length; i++) {
    const result = results[i];
    if (!result) {
      continue;
    }

    // Check mode streaks
    if (result.mode === currentMode) {
      currentModeStreak++;
    } else {
      if (currentModeStreak > 1) {
        const streakLength = currentModeStreak;
        const startPos = i - streakLength;
        consecutiveModes.push({
          mode: currentMode,
          count: streakLength,
          positions: Array.from({ length: streakLength }, (_, j) => startPos + j),
        });
      }
      currentMode = result.mode;
      currentModeStreak = 1;
    }

    // Check map streaks
    if (result.map === currentMap) {
      currentMapStreak++;
    } else {
      if (currentMapStreak > 1) {
        const streakLength = currentMapStreak;
        const startPos = i - streakLength;
        consecutiveMaps.push({
          map: currentMap,
          count: streakLength,
          positions: Array.from({ length: streakLength }, (_, j) => startPos + j),
        });
      }
      currentMap = result.map;
      currentMapStreak = 1;
    }
  }

  // Handle final streaks
  if (currentModeStreak > 1) {
    const streakLength = currentModeStreak;
    const startPos = results.length - streakLength;
    consecutiveModes.push({
      mode: currentMode,
      count: streakLength,
      positions: Array.from({ length: streakLength }, (_, j) => startPos + j),
    });
  }

  if (currentMapStreak > 1) {
    const streakLength = currentMapStreak;
    const startPos = results.length - streakLength;
    consecutiveMaps.push({
      map: currentMap,
      count: streakLength,
      positions: Array.from({ length: streakLength }, (_, j) => startPos + j),
    });
  }

  return { consecutiveModes, consecutiveMaps };
};

describe("Consecutive Prevention Tests", () => {
  it("prevents back-to-back modes in random format with sufficient options", () => {
    const pool = createHcsPool();
    // Create a random format sequence for testing
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    // Run multiple times to test consistency
    const analyses = Array.from({ length: 20 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      return analyzeConsecutivePatterns(result);
    });

    for (const { consecutiveModes } of analyses) {
      // Should avoid back-to-back modes when alternatives are available
      const backToBackModes = consecutiveModes.filter((streak) => streak.count === 2);
      const tripleOrMoreModes = consecutiveModes.filter((streak) => streak.count >= 3);

      // Should rarely have back-to-back modes and never have 3+ in a row
      expect(tripleOrMoreModes.length).toBe(0);
      expect(backToBackModes.length).toBeLessThanOrEqual(1); // Allow occasional back-to-back but minimize
    }
  });

  it("prevents back-to-back maps in random format with sufficient options", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    // Run multiple times to test consistency
    const analyses = Array.from({ length: 20 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      return analyzeConsecutivePatterns(result);
    });

    for (const { consecutiveMaps } of analyses) {
      // Should avoid back-to-back maps when alternatives are available
      const backToBackMaps = consecutiveMaps.filter((streak) => streak.count === 2);
      const tripleOrMoreMaps = consecutiveMaps.filter((streak) => streak.count >= 3);

      // Should never have 3+ maps in a row, minimize back-to-back
      expect(tripleOrMoreMaps.length).toBe(0);
      expect(backToBackMaps.length).toBeLessThanOrEqual(1); // Allow occasional back-to-back but minimize
    }
  });

  it("demonstrates significant improvement in consecutive prevention", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    // Test our improved algorithm
    const results = Array.from({ length: 50 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });
      return analyzeConsecutivePatterns(result);
    });

    // Calculate metrics
    const totalBackToBackModes = results.reduce(
      (sum, { consecutiveModes }) => sum + consecutiveModes.filter((s) => s.count === 2).length,
      0,
    );
    const totalTripleModes = results.reduce(
      (sum, { consecutiveModes }) => sum + consecutiveModes.filter((s) => s.count >= 3).length,
      0,
    );

    const totalBackToBackMaps = results.reduce(
      (sum, { consecutiveMaps }) => sum + consecutiveMaps.filter((s) => s.count === 2).length,
      0,
    );
    const totalTripleMaps = results.reduce(
      (sum, { consecutiveMaps }) => sum + consecutiveMaps.filter((s) => s.count >= 3).length,
      0,
    );

    // Our algorithm should minimize consecutive repetitions
    expect(totalTripleModes).toBe(0); // Never allow 3+ modes in a row
    expect(totalTripleMaps).toBe(0); // Never allow 3+ maps in a row
    expect(totalBackToBackModes).toBeLessThan(5); // Minimize back-to-back modes (enhanced)
    expect(totalBackToBackMaps).toBeLessThan(5); // Minimize back-to-back maps (enhanced)

    console.log(`📊 Consecutive Analysis (50 runs):`);
    console.log(
      `  Back-to-back modes: ${String(totalBackToBackModes)} (avg ${(totalBackToBackModes / 50).toFixed(2)} per run)`,
    );
    console.log(`  Triple+ modes: ${String(totalTripleModes)}`);
    console.log(
      `  Back-to-back maps: ${String(totalBackToBackMaps)} (avg ${(totalBackToBackMaps / 50).toFixed(2)} per run)`,
    );
    console.log(`  Triple+ maps: ${String(totalTripleMaps)}`);
  });

  it("prevents clustering patterns in longer series (7 games)", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    // Test multiple 7-game series for clustering patterns
    const analyses = Array.from({ length: 30 }, () => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
      });

      // Analyze for clustering: count occurrences of each mode/map
      const modeCounts = new Map<MapMode, number>();
      const mapCounts = new Map<string, number>();

      for (const game of result) {
        modeCounts.set(game.mode, (modeCounts.get(game.mode) ?? 0) + 1);
        mapCounts.set(game.map, (mapCounts.get(game.map) ?? 0) + 1);
      }

      return { modeCounts, mapCounts, result };
    });

    // Check for excessive clustering
    let excessiveModeClustering = 0;
    let excessiveMapClustering = 0;

    for (const { modeCounts, mapCounts } of analyses) {
      // For 7 objective games with 4 available modes, no mode should appear more than 3 times
      const maxModeCount = Math.max(...Array.from(modeCounts.values()));
      if (maxModeCount > 3) {
        excessiveModeClustering++;
      }

      // For maps, with sufficient options, no map should dominate too much
      const maxMapCount = Math.max(...Array.from(mapCounts.values()));
      if (maxMapCount > 3) {
        // Allow some clustering but prevent dominance
        excessiveMapClustering++;
      }
    }

    // Should rarely have excessive clustering
    expect(excessiveModeClustering).toBeLessThan(5); // Less than 17% of runs
    expect(excessiveMapClustering).toBeLessThan(8); // Less than 27% of runs (maps have fewer options)

    console.log(`📊 Clustering Analysis (30 runs of 7 games):`);
    console.log(
      `  Excessive mode clustering (>3 uses): ${String(excessiveModeClustering)}/30 (${((excessiveModeClustering / 30) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Excessive map clustering (>3 uses): ${String(excessiveMapClustering)}/30 (${((excessiveMapClustering / 30) * 100).toFixed(1)}%)`,
    );
  });

  it("handles limited pool gracefully while still trying to prevent consecutives", () => {
    // Test with very limited pool where some consecutives might be unavoidable
    const limitedPool: { mode: MapMode; map: string }[] = [
      { mode: "Capture the Flag", map: "Aquarius" },
      { mode: "Strongholds", map: "Live Fire" },
    ];

    const result = generateRoundRobinMaps({
      count: 5,
      pool: limitedPool,
      formatSequence: ["objective", "objective", "objective", "objective", "objective"],
    });

    expect(result).toHaveLength(5);

    // With only 2 modes available for 5 games, some repetition is inevitable
    // But algorithm should still try to alternate when possible
    const analysis = analyzeConsecutivePatterns(result);

    // Even with limited options, should not have extreme consecutive streaks
    const longStreaks = analysis.consecutiveModes.filter((s) => s.count >= 4);
    expect(longStreaks.length).toBe(0); // Should not have 4+ consecutive modes
  });
});
