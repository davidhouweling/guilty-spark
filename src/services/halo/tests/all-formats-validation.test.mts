import { describe, it, expect } from "vitest";
import { FormatType, PlaylistType } from "../halo.mjs";
import type { MapMode } from "../hcs.mjs";
import { installFakeServicesWith } from "../../fakes/services.mjs";

describe("All Format Types - Distribution Analysis", () => {
  const services = installFakeServicesWith();
  const iterations = 100; // Run each format 100 times
  const testCounts = [3, 5, 7] as const; // Test different game counts

  // Helper to analyze results
  const analyzeResults = (
    results: { mode: MapMode; map: string }[][],
    formatName: string,
    gameCount: number,
  ): {
    avgUniqueMapsPer: number;
    avgUniqueModePer: number;
    allMapsUsed: number;
    allModesUsed: number;
    mapRepeatRate: number;
    modeRepeatRate: number;
    maxMapRepeatsAcrossRuns: number;
    maxModeRepeatsAcrossRuns: number;
  } => {
    let totalGames = 0;
    let totalUniqueMapsSummed = 0;
    let totalUniqueModesSummed = 0;
    let totalMapRepeats = 0;
    let totalModeRepeats = 0;
    let maxMapRepeatsAcrossRuns = 0;
    let maxModeRepeatsAcrossRuns = 0;

    const allMapsUsed = new Set<string>();
    const allModesUsed = new Set<MapMode>();

    for (const result of results) {
      totalGames += result.length;

      // Count unique maps and modes per run
      const runMaps = new Set(result.map((r) => r.map));
      const runModes = new Set(result.map((r) => r.mode));

      totalUniqueMapsSummed += runMaps.size;
      totalUniqueModesSummed += runModes.size;

      // Track all maps and modes used across runs
      for (const game of result) {
        allMapsUsed.add(game.map);
        allModesUsed.add(game.mode);
      }

      // Count repeats in this run
      const mapCounts = new Map<string, number>();
      const modeCounts = new Map<MapMode, number>();

      for (const game of result) {
        mapCounts.set(game.map, (mapCounts.get(game.map) ?? 0) + 1);
        modeCounts.set(game.mode, (modeCounts.get(game.mode) ?? 0) + 1);
      }

      const maxMapRepeatsThisRun = Math.max(...Array.from(mapCounts.values()));
      const maxModeRepeatsThisRun = Math.max(...Array.from(modeCounts.values()));

      maxMapRepeatsAcrossRuns = Math.max(maxMapRepeatsAcrossRuns, maxMapRepeatsThisRun);
      maxModeRepeatsAcrossRuns = Math.max(maxModeRepeatsAcrossRuns, maxModeRepeatsThisRun);

      totalMapRepeats += Array.from(mapCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
      totalModeRepeats += Array.from(modeCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    }

    const avgUniqueMapsPer = totalUniqueMapsSummed / results.length;
    const avgUniqueModePer = totalUniqueModesSummed / results.length;
    const mapRepeatRate = totalMapRepeats / totalGames;
    const modeRepeatRate = totalModeRepeats / totalGames;

    console.log(`\n📊 ${formatName} (${String(gameCount)} games) - ${String(iterations)} iterations:`);
    console.log(
      `  Average unique maps per run: ${String(avgUniqueMapsPer.toFixed(2))}/${String(gameCount)} (${String(((avgUniqueMapsPer / gameCount) * 100).toFixed(1))}%)`,
    );
    console.log(
      `  Average unique modes per run: ${String(avgUniqueModePer.toFixed(2))}/${String(gameCount)} (${String(((avgUniqueModePer / gameCount) * 100).toFixed(1))}%)`,
    );
    console.log(`  Total unique maps used: ${String(allMapsUsed.size)}`);
    console.log(`  Total unique modes used: ${String(allModesUsed.size)}`);
    console.log(
      `  Map repeat rate: ${String((mapRepeatRate * 100).toFixed(1))}% (${String(totalMapRepeats)}/${String(totalGames)})`,
    );
    console.log(
      `  Mode repeat rate: ${String((modeRepeatRate * 100).toFixed(1))}% (${String(totalModeRepeats)}/${String(totalGames)})`,
    );
    console.log(`  Max map repeats in single run: ${String(maxMapRepeatsAcrossRuns)}`);
    console.log(`  Max mode repeats in single run: ${String(maxModeRepeatsAcrossRuns)}`);

    // Return metrics for assertions
    return {
      avgUniqueMapsPer,
      avgUniqueModePer,
      allMapsUsed: allMapsUsed.size,
      allModesUsed: allModesUsed.size,
      mapRepeatRate,
      modeRepeatRate,
      maxMapRepeatsAcrossRuns,
      maxModeRepeatsAcrossRuns,
    };
  };

  for (const count of testCounts) {
    it(`validates HCS format distribution for ${String(count)} games`, () => {
      const results: { mode: MapMode; map: string }[][] = [];

      for (let i = 0; i < iterations; i++) {
        const result = services.haloService.generateMaps({
          count,
          playlist: PlaylistType.HcsCurrent,
          format: FormatType.Hcs,
        });
        results.push(result);
      }

      const metrics = analyzeResults(results, "HCS", count);

      // HCS should follow official format sequences
      expect(metrics.avgUniqueMapsPer).toBeGreaterThan(Math.min(count * 0.6, 4)); // Good map diversity
      expect(metrics.avgUniqueModePer).toBeGreaterThan(Math.min(count * 0.4, 3)); // Mode variety follows format
      expect(metrics.maxMapRepeatsAcrossRuns).toBeLessThanOrEqual(Math.ceil(count / 2)); // Reasonable map repeats
      expect(metrics.mapRepeatRate).toBeLessThan(0.4); // Less than 40% repeat rate
      expect(metrics.allModesUsed).toBeGreaterThanOrEqual(3); // Uses multiple modes
    });

    it(`validates Random format distribution for ${String(count)} games`, () => {
      const results: { mode: MapMode; map: string }[][] = [];

      for (let i = 0; i < iterations; i++) {
        const result = services.haloService.generateMaps({
          count,
          playlist: PlaylistType.HcsCurrent,
          format: FormatType.Random,
        });
        results.push(result);
      }

      const metrics = analyzeResults(results, "Random", count);

      // Random should have good diversity and fair mode distribution
      expect(metrics.avgUniqueMapsPer).toBeGreaterThan(Math.min(count * 0.6, 5)); // Good map diversity
      expect(metrics.avgUniqueModePer).toBeGreaterThan(Math.min(count * 0.5, 3)); // Good mode variety
      expect(metrics.maxMapRepeatsAcrossRuns).toBeLessThanOrEqual(Math.ceil(count / 2)); // Controlled repeats
      expect(metrics.mapRepeatRate).toBeLessThan(0.35); // Low repeat rate
      expect(metrics.allModesUsed).toBeGreaterThanOrEqual(4); // Uses many modes

      // Check that slayer appears at reasonable frequency (should be ~1/6 due to our fix)
      const slayerGames = results.flat().filter((game) => game.mode === "Slayer").length;
      const totalGames = results.flat().length;
      const slayerRate = slayerGames / totalGames;

      expect(slayerRate).toBeGreaterThan(0.1); // At least 10%
      expect(slayerRate).toBeLessThan(0.25); // At most 25% (should be ~16.7%)
    });

    it(`validates Random Objective format distribution for ${String(count)} games`, () => {
      const results: { mode: MapMode; map: string }[][] = [];

      for (let i = 0; i < iterations; i++) {
        const result = services.haloService.generateMaps({
          count,
          playlist: PlaylistType.HcsCurrent,
          format: FormatType.RandomObjective,
        });
        results.push(result);
      }

      const metrics = analyzeResults(results, "Random Objective", count);

      // Random Objective should only have objective modes
      expect(metrics.avgUniqueMapsPer).toBeGreaterThan(Math.min(count * 0.5, 4)); // Reasonable map diversity
      expect(metrics.avgUniqueModePer).toBeGreaterThan(Math.min(count * 0.4, 3)); // Mode variety among objectives
      expect(metrics.maxModeRepeatsAcrossRuns).toBeLessThanOrEqual(Math.ceil(count / 2 + 1)); // Some mode repeats expected
      expect(metrics.allModesUsed).toBeGreaterThanOrEqual(3); // Multiple objective modes

      // Verify NO slayer games appear
      const slayerGames = results.flat().filter((game) => game.mode === "Slayer").length;
      expect(slayerGames).toBe(0);

      // All games should be objective modes
      const objectiveGames = results.flat().filter((game) => game.mode !== "Slayer").length;
      const totalGames = results.flat().length;
      expect(objectiveGames).toBe(totalGames);
    });

    it(`validates Random Slayer format distribution for ${String(count)} games`, () => {
      const results: { mode: MapMode; map: string }[][] = [];

      for (let i = 0; i < iterations; i++) {
        const result = services.haloService.generateMaps({
          count,
          playlist: PlaylistType.HcsCurrent,
          format: FormatType.RandomSlayer,
        });
        results.push(result);
      }

      const metrics = analyzeResults(results, "Random Slayer", count);

      // Random Slayer should only have slayer mode
      expect(metrics.avgUniqueMapsPer).toBeGreaterThan(Math.min(count * 0.7, 5)); // Good map diversity for slayer
      expect(metrics.avgUniqueModePer).toBe(1); // Only slayer mode
      expect(metrics.maxMapRepeatsAcrossRuns).toBeLessThanOrEqual(Math.ceil(count / 3 + 1)); // Some map repeats expected
      expect(metrics.allModesUsed).toBe(1); // Only slayer mode

      // Verify ALL games are slayer
      const slayerGames = results.flat().filter((game) => game.mode === "Slayer").length;
      const totalGames = results.flat().length;
      expect(slayerGames).toBe(totalGames);

      // Verify NO objective games appear
      const objectiveGames = results.flat().filter((game) => game.mode !== "Slayer").length;
      expect(objectiveGames).toBe(0);
    });
  }

  it("compares all formats for optimal distribution characteristics", () => {
    const count = 7; // Use 7-game series for comparison
    const formatResults: Record<
      string,
      {
        avgUniqueMapsPer: number;
        avgUniqueModePer: number;
        allMapsUsed: number;
        allModesUsed: number;
        mapRepeatRate: number;
        modeRepeatRate: number;
        maxMapRepeatsAcrossRuns: number;
        maxModeRepeatsAcrossRuns: number;
      }
    > = {};

    // Test each format
    const formats = [
      { type: FormatType.Hcs, name: "HCS" },
      { type: FormatType.Random, name: "Random" },
      { type: FormatType.RandomObjective, name: "Random Objective" },
      { type: FormatType.RandomSlayer, name: "Random Slayer" },
    ];

    for (const format of formats) {
      const results: { mode: MapMode; map: string }[][] = [];

      for (let i = 0; i < 50; i++) {
        // 50 iterations for comparison
        const result = services.haloService.generateMaps({
          count,
          playlist: PlaylistType.HcsCurrent,
          format: format.type,
        });
        results.push(result);
      }

      formatResults[format.name] = analyzeResults(results, format.name, count);
    }

    // Comparative analysis
    console.log("\n🔍 COMPARATIVE ANALYSIS:");
    console.log("Format | Avg Maps | Avg Modes | Map Repeat % | Mode Repeat %");
    console.log("-------|----------|-----------|--------------|-------------");

    for (const [formatName, metrics] of Object.entries(formatResults)) {
      console.log(
        `${formatName.padEnd(6)} | ${String(metrics.avgUniqueMapsPer.toFixed(1)).padStart(8)} | ${String(metrics.avgUniqueModePer.toFixed(1)).padStart(9)} | ${String((metrics.mapRepeatRate * 100).toFixed(1)).padStart(11)}% | ${String((metrics.modeRepeatRate * 100).toFixed(1)).padStart(12)}%`,
      );
    }

    // All formats should have reasonable distribution
    for (const [formatName, metrics] of Object.entries(formatResults)) {
      expect(metrics.avgUniqueMapsPer).toBeGreaterThan(3); // Minimum diversity
      expect(metrics.mapRepeatRate).toBeLessThan(0.5); // Max 50% repeat rate

      if (formatName !== "Random Slayer") {
        expect(metrics.avgUniqueModePer).toBeGreaterThan(1); // Mode variety (except slayer-only)
      }
    }
  });
});
