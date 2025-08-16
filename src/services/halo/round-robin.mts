import { Preconditions } from "../../base/preconditions.mjs";
import type { MapMode } from "./hcs.mjs";

export interface RoundRobinArgs {
  count: number;
  pool: { mode: MapMode; map: string }[];
  formatSequence: ("slayer" | "objective")[];
}

export type generateRoundRobinMapsFn = (args: RoundRobinArgs) => { mode: MapMode; map: string }[];

// Helper function to shuffle an array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = Preconditions.checkExists(shuffled[i]);
    shuffled[i] = Preconditions.checkExists(shuffled[j]);
    shuffled[j] = temp;
  }
  return shuffled;
}

// Scoring penalties and bonuses as constants
const SCORING = {
  PENALTIES: {
    CONSECUTIVE_SAME_MODE: 3000,
    CONSECUTIVE_SAME_MAP: 2500,
    CONSECUTIVE_SAME_COMBO: 4000,
    RECENT_MODE_CLUSTERING: 1500,
    RECENT_MAP_CLUSTERING: 1200,
    OVERUSE_BASE: 800,
  },
  BONUSES: {
    UNUSED_MODE_BASE: 1000,
    UNUSED_MODE_PENALTY: 400,
    BALANCED_MODE: 200,
    UNUSED_MAP: 300,
    UNUSED_COMBO: 10,
    OVERUSED_MODE_MIN: 10,
  },
} as const;

function applyImmediatePenalties(
  candidate: { mode: MapMode; map: string },
  previousPick: { mode: MapMode; map: string } | null,
  candidates: { mode: MapMode; map: string }[],
): number {
  if (!previousPick) {
    return 0;
  }

  let penalty = 0;

  // Check for consecutive same mode
  if (candidate.mode === previousPick.mode) {
    const otherModes = candidates.filter((c) => c.mode !== previousPick.mode);
    if (otherModes.length > 0) {
      penalty -= SCORING.PENALTIES.CONSECUTIVE_SAME_MODE;
    }
  }

  // Check for consecutive same map
  if (candidate.map === previousPick.map) {
    const otherMaps = candidates.filter((c) => c.map !== previousPick.map);
    if (otherMaps.length > 0) {
      penalty -= SCORING.PENALTIES.CONSECUTIVE_SAME_MAP;
    }
  }

  // Extra penalty for exact same combo
  if (candidate.mode === previousPick.mode && candidate.map === previousPick.map) {
    penalty -= SCORING.PENALTIES.CONSECUTIVE_SAME_COMBO;
  }

  return penalty;
}

function applyPatternPenalties(
  candidate: { mode: MapMode; map: string },
  recentPicks: { mode: MapMode; map: string }[],
  candidates: { mode: MapMode; map: string }[],
): number {
  let penalty = 0;

  const recentModeCount = recentPicks.filter((p) => p.mode === candidate.mode).length;
  const recentMapCount = recentPicks.filter((p) => p.map === candidate.map).length;

  // Penalize recent mode clustering
  if (recentModeCount >= 2) {
    const otherModes = candidates.filter((c) => c.mode !== candidate.mode);
    if (otherModes.length > 0) {
      penalty -= SCORING.PENALTIES.RECENT_MODE_CLUSTERING * recentModeCount;
    }
  }

  // Penalize recent map clustering
  if (recentMapCount >= 2) {
    const otherMaps = candidates.filter((c) => c.map !== candidate.map);
    if (otherMaps.length > 0) {
      penalty -= SCORING.PENALTIES.RECENT_MAP_CLUSTERING * recentMapCount;
    }
  }

  return penalty;
}

function applyOverusePenalties(
  candidate: { mode: MapMode; map: string },
  modeCount: number,
  count: number,
  candidates: { mode: MapMode; map: string }[],
  usedModes: Map<MapMode, number>,
): number {
  if (count < 5) {
    return 0; // Only apply for longer series
  }

  const maxReasonableUse = Math.ceil(count / Math.max(1, candidates.length / 2));
  if (modeCount >= maxReasonableUse) {
    const alternativeModes = candidates.filter(
      (c) => (usedModes.get(c.mode) ?? 0) < maxReasonableUse && c.mode !== candidate.mode,
    );
    if (alternativeModes.length > 0) {
      return -SCORING.PENALTIES.OVERUSE_BASE * (modeCount - maxReasonableUse + 1);
    }
  }

  return 0;
}

function applyModeBalanceBonuses(
  modeCount: number,
  candidates: { mode: MapMode; map: string }[],
  formatSequence: ("slayer" | "objective")[],
  type: "slayer" | "objective",
): number {
  const availableModes = new Set(candidates.map((c) => c.mode));
  const roundsOfThisType = formatSequence.filter((f) => (f === "slayer") === (type === "slayer")).length;
  const maxModeUsage = Math.ceil(roundsOfThisType / availableModes.size);

  if (modeCount < maxModeUsage) {
    return SCORING.BONUSES.UNUSED_MODE_BASE - modeCount * SCORING.BONUSES.UNUSED_MODE_PENALTY;
  } else if (modeCount === maxModeUsage) {
    return SCORING.BONUSES.BALANCED_MODE;
  } else {
    return Math.max(SCORING.BONUSES.OVERUSED_MODE_MIN, 50 - (modeCount - maxModeUsage) * 20);
  }
}

function applyDiversityBonuses(
  candidate: { mode: MapMode; map: string },
  usedMaps: Set<string>,
  usedCombos: Set<string>,
  comboKey: string,
): number {
  let bonus = 0;

  // Bonus for unused maps
  if (!usedMaps.has(candidate.map)) {
    bonus += SCORING.BONUSES.UNUSED_MAP;
  }

  // Bonus for unused combos
  if (!usedCombos.has(comboKey)) {
    bonus += SCORING.BONUSES.UNUSED_COMBO;
  }

  return bonus;
}

// Helper function to calculate candidate score
function calculateCandidateScore({
  candidate,
  previousPick,
  recentPicks,
  candidates,
  usedModes,
  usedMaps,
  usedCombos,
  count,
  formatSequence,
  type,
}: {
  candidate: { mode: MapMode; map: string };
  previousPick: { mode: MapMode; map: string } | null;
  recentPicks: { mode: MapMode; map: string }[];
  candidates: { mode: MapMode; map: string }[];
  usedModes: Map<MapMode, number>;
  usedMaps: Set<string>;
  usedCombos: Set<string>;
  count: number;
  formatSequence: ("slayer" | "objective")[];
  type: "slayer" | "objective";
}): number {
  const comboKey = `${String(candidate.mode)}:${candidate.map}`;
  const modeCount = usedModes.get(candidate.mode) ?? 0;
  let score = 0;

  // Apply immediate back-to-back penalties
  score += applyImmediatePenalties(candidate, previousPick, candidates);

  // Apply recent pattern penalties
  score += applyPatternPenalties(candidate, recentPicks, candidates);

  // Apply series-wide overuse penalties
  score += applyOverusePenalties(candidate, modeCount, count, candidates, usedModes);

  // Apply mode balance bonuses
  score += applyModeBalanceBonuses(modeCount, candidates, formatSequence, type);

  // Apply map and combo diversity bonuses
  score += applyDiversityBonuses(candidate, usedMaps, usedCombos, comboKey);

  // Add small random component for tie-breaking
  score += Math.random();

  return score;
}

// Helper function to select the best candidate based on scoring algorithm
function selectBestCandidate({
  candidates,
  result,
  usedModes,
  usedMaps,
  usedCombos,
  count,
  formatSequence,
  type,
}: {
  candidates: { mode: MapMode; map: string }[];
  result: { mode: MapMode; map: string }[];
  usedModes: Map<MapMode, number>;
  usedMaps: Set<string>;
  usedCombos: Set<string>;
  count: number;
  formatSequence: ("slayer" | "objective")[];
  type: "slayer" | "objective";
}): { mode: MapMode; map: string } {
  let bestPick: { mode: MapMode; map: string } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  // Get recent picks for pattern analysis
  const recentPicks = result.slice(-3);
  const previousPick = result.length > 0 ? (result[result.length - 1] ?? null) : null;

  for (const candidate of candidates) {
    const score = calculateCandidateScore({
      candidate,
      previousPick,
      recentPicks,
      candidates,
      usedModes,
      usedMaps,
      usedCombos,
      count,
      formatSequence,
      type,
    });

    if (score > bestScore) {
      bestScore = score;
      bestPick = candidate;
    }
  }

  // Fallback to first candidate if no pick was made
  return bestPick ?? Preconditions.checkExists(candidates[0]);
}

export const generateRoundRobinMaps: generateRoundRobinMapsFn = ({ count, pool, formatSequence }) => {
  // Handle empty format sequence by defaulting to random alternation
  if (formatSequence.length === 0) {
    const defaultFormat: ("slayer" | "objective")[] = Array.from({ length: count }, (_, i) =>
      i % 2 === 0 ? "slayer" : "objective",
    );
    return generateRoundRobinMaps({ count, pool, formatSequence: defaultFormat });
  }

  // Separate and shuffle pools by type
  const slayerPairs = shuffleArray(pool.filter(({ mode }) => mode === "Slayer"));
  const objectivePairs = shuffleArray(pool.filter(({ mode }) => mode !== "Slayer"));

  const result: { mode: MapMode; map: string }[] = [];
  const usedMaps = new Set<string>();
  const usedModes = new Map<MapMode, number>();
  const usedCombos = new Set<string>();

  for (let i = 0; i < count; i++) {
    const type = Preconditions.checkExists(formatSequence[i % formatSequence.length]);
    const candidates = type === "slayer" ? slayerPairs : objectivePairs;

    if (candidates.length === 0) {
      throw new Error(`No ${type} candidates available in pool`);
    }

    const bestPick = selectBestCandidate({
      candidates,
      result,
      usedModes,
      usedMaps,
      usedCombos,
      count,
      formatSequence,
      type,
    });

    result.push(bestPick);
    usedMaps.add(bestPick.map);
    usedModes.set(bestPick.mode, (usedModes.get(bestPick.mode) ?? 0) + 1);
    usedCombos.add(`${String(bestPick.mode)}:${bestPick.map}`);

    // Reset map tracking when all unique maps in current candidate pool are exhausted
    const uniqueAvailableMaps = new Set(candidates.map((c) => c.map));
    if (usedMaps.size >= uniqueAvailableMaps.size) {
      usedMaps.clear();
    }
  }

  return result;
};
