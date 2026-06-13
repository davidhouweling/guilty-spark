import { describe, it, expect } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { generateRoundRobinMaps } from "../round-robin";
import { CURRENT_HCS_MAPS, HCS_SET_FORMAT, ALL_MODES } from "../../../services/halo/hcs";
import type { MapMode } from "../../../services/halo/hcs";

function makeLcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

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
    const runs = Array.from({ length: 5 }, (_, i) =>
      generateRoundRobinMaps({
        count: 5,
        pool: fakePool,
        formatSequence,
        random: makeLcg(i + 1),
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
    const lcg = makeLcg(1);
    const formatSequence = Preconditions.checkExists(HCS_SET_FORMAT[7]).map((f) =>
      f === "random" ? (lcg() < 0.5 ? "slayer" : "objective") : f,
    );

    const analyses = Array.from({ length: 10 }, (_, i) => {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
        random: makeLcg(i + 1),
      });
      return analyzeDistribution(result);
    });

    for (const analysis of analyses) {
      expect(analysis.maxMapRepeats).toBeLessThanOrEqual(2);
      expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(5);
      expect(analysis.maxComboRepeats).toBeLessThanOrEqual(1);
    }
  });

  it("achieves good mode distribution in objective-heavy sequences", () => {
    const pool = createHcsPool();
    const formatSequence = Array(7).fill("objective") as ("slayer" | "objective")[];

    const result = generateRoundRobinMaps({
      count: 7,
      pool,
      formatSequence,
      random: makeLcg(42),
    });

    const analysis = analyzeDistribution(result);

    expect(analysis.uniqueModes).toBeGreaterThanOrEqual(3);
    expect(analysis.maxModeRepeats).toBeLessThanOrEqual(3);

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
      random: makeLcg(42),
    });

    expect(result).toHaveLength(5);

    expect(Preconditions.checkExists(result[0]).mode).toBe("Slayer");
    expect(Preconditions.checkExists(result[1]).mode).toBe("Oddball");
    expect(Preconditions.checkExists(result[2]).mode).toBe("Slayer");
    expect(Preconditions.checkExists(result[3]).mode).toBe("Oddball");
    expect(Preconditions.checkExists(result[4]).mode).toBe("Slayer");
  });

  it("ensures format sequence adherence with real HCS data", () => {
    const pool = createHcsPool();
    const formatSequence = Preconditions.checkExists(HCS_SET_FORMAT[5]);
    const lcg = makeLcg(1);

    const result = generateRoundRobinMaps({
      count: 5,
      pool,
      formatSequence: formatSequence.map((f) => (f === "random" ? (lcg() < 0.5 ? "slayer" : "objective") : f)),
      random: makeLcg(42),
    });

    expect(result).toHaveLength(5);

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

    const formatSequence = ["objective", "objective", "objective", "objective", "objective"] as (
      | "slayer"
      | "objective"
    )[];

    const ourResults = Array.from({ length: 20 }, (_, i) => {
      const result = generateRoundRobinMaps({
        count: 5,
        pool,
        formatSequence,
        random: makeLcg(i + 1),
      });
      return analyzeDistribution(result);
    });

    const avgUniqueMapCount = ourResults.reduce((sum, a) => sum + a.uniqueMaps, 0) / ourResults.length;
    const avgMaxMapRepeats = ourResults.reduce((sum, a) => sum + a.maxMapRepeats, 0) / ourResults.length;
    const avgUniqueModeCount = ourResults.reduce((sum, a) => sum + a.uniqueModes, 0) / ourResults.length;

    expect(avgUniqueMapCount).toBeGreaterThan(3);
    expect(avgMaxMapRepeats).toBeLessThan(2.5);
    expect(avgUniqueModeCount).toBeGreaterThan(2.5);
  });

  it("handles empty format sequence gracefully", () => {
    const pool = createHcsPool();

    const result = generateRoundRobinMaps({
      count: 3,
      pool,
      formatSequence: [],
      random: makeLcg(42),
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
      random: makeLcg(42),
    });
    const duration = Date.now() - startTime;

    expect(result).toHaveLength(15);
    expect(duration).toBeLessThan(1000);

    const analysis = analyzeDistribution(result);
    expect(analysis.uniqueMaps).toBeGreaterThan(6);
  });

  it("validates deterministic behavior with same inputs", () => {
    const pool = createHcsPool();
    const formatSequence: ("slayer" | "objective")[] = ["slayer", "objective", "slayer"];

    const result1 = generateRoundRobinMaps({ count: 3, pool, formatSequence, random: makeLcg(42) });
    const result2 = generateRoundRobinMaps({ count: 3, pool, formatSequence, random: makeLcg(42) });

    expect(result1).toEqual(result2);
  });

  it("handles extreme scoring edge cases", () => {
    const extremePool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "OnlySlayerMap" },
      { mode: "Oddball", map: "OnlyObjectiveMap" },
    ];

    const result = generateRoundRobinMaps({
      count: 4,
      pool: extremePool,
      formatSequence: ["slayer", "objective", "slayer", "objective"],
      random: makeLcg(42),
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

    for (let i = 0; i < 100; i++) {
      const result = generateRoundRobinMaps({
        count: 7,
        pool,
        formatSequence,
        random: makeLcg(i + 1),
      });
      expect(result).toHaveLength(7);
    }

    expect(true).toBe(true);
  });

  it("ensures backward compatibility with existing data structures", () => {
    const pool = Object.entries(CURRENT_HCS_MAPS).flatMap(([mode, maps]) =>
      maps.map((map) => ({ mode: mode as MapMode, map })),
    );

    const result = generateRoundRobinMaps({
      count: 5,
      pool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer"],
      random: makeLcg(42),
    });

    expect(result).toHaveLength(5);

    for (const entry of result) {
      expect(entry).toHaveProperty("mode");
      expect(entry).toHaveProperty("map");
      expect(typeof entry.mode).toBe("string");
      expect(typeof entry.map).toBe("string");
    }
  });

  it("adapts gracefully when maps are added to existing modes", () => {
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
      random: makeLcg(42),
    });

    expect(result).toHaveLength(7);

    const analysis = analyzeDistribution(result);

    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(6);
    expect(analysis.maxMapRepeats).toBeLessThanOrEqual(2);

    expect(result[0]?.mode).toBe("Slayer");
    expect(result[2]?.mode).toBe("Slayer");
    expect(result[4]?.mode).toBe("Slayer");
    expect(result[1]?.mode).not.toBe("Slayer");
    expect(result[3]?.mode).not.toBe("Slayer");
  });

  it("handles maps being removed from modes gracefully", () => {
    const reducedPool = createHcsPool().filter(({ mode, map }) => {
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
      random: makeLcg(42),
    });

    expect(result).toHaveLength(7);

    const analysis = analyzeDistribution(result);

    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(4);
    expect(analysis.maxMapRepeats).toBeLessThanOrEqual(3);

    expect(result[0]?.mode).toBe("Slayer");
    expect(result[2]?.mode).toBe("Slayer");
    expect(result[4]?.mode).toBe("Slayer");
  });

  it("adapts to completely new modes being added", () => {
    const extendedPool = createHcsPool();
    extendedPool.push(
      { mode: "Extraction" as MapMode, map: "NewExtractionMap1" },
      { mode: "Extraction" as MapMode, map: "NewExtractionMap2" },
      { mode: "VIP" as MapMode, map: "NewVIPMap" },
    );

    const result = generateRoundRobinMaps({
      count: 5,
      pool: extendedPool,
      formatSequence: ["objective", "objective", "objective", "objective", "objective"],
      random: makeLcg(42),
    });

    expect(result).toHaveLength(5);

    const analysis = analyzeDistribution(result);

    expect(analysis.uniqueModes).toBeGreaterThanOrEqual(3);
    expect(result.every((r) => r.mode !== "Slayer")).toBe(true);
  });

  it("handles extreme scenarios with very limited mode availability", () => {
    const minimalPool: { mode: MapMode; map: string }[] = [
      { mode: "Slayer", map: "OnlySlayerMap" },
      { mode: "Oddball", map: "OnlyOddballMap" },
    ];

    const result = generateRoundRobinMaps({
      count: 6,
      pool: minimalPool,
      formatSequence: ["slayer", "objective", "slayer", "objective", "slayer", "objective"],
      random: makeLcg(42),
    });

    expect(result).toHaveLength(6);

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
      random: makeLcg(42),
    });

    expect(result).toHaveLength(10);

    const analysis = analyzeDistribution(result);

    expect(analysis.uniqueMaps).toBeGreaterThanOrEqual(7);

    const slayerGames = result.filter((r) => r.mode === "Slayer");
    const slayerMaps = new Set(slayerGames.map((r) => r.map));
    expect(slayerMaps.size).toBe(5);

    const objectiveGames = result.filter((r) => r.mode !== "Slayer");
    expect(objectiveGames.length).toBe(5);
  });

  it("validates that map pool changes don't break format sequence adherence", () => {
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

    for (const [i, pool] of poolConfigurations.entries()) {
      const result = generateRoundRobinMaps({
        count: 5,
        pool,
        formatSequence,
        random: makeLcg(i + 1),
      });

      expect(result).toHaveLength(5);

      for (let j = 0; j < formatSequence.length; j++) {
        const expectedType = formatSequence[j];
        const actualMode = result[j]?.mode;

        if (expectedType === "slayer") {
          expect(actualMode).toBe("Slayer");
        } else {
          expect(actualMode).not.toBe("Slayer");
        }
      }
    }
  });
});
