import { byTimestamp, groupBySlot } from "./group-by-slot";
import type { BipedLife, BipedPosition } from "./types";

// a gap this long inside one slot opens a new life: far above the replication cadence and
// well below the respawn time
export const LIFE_GAP_MS = 5_000;
// a lone sample that survived the isolation filter is a chance match, not a life
const MIN_LIFE_SAMPLES = 2;

interface MutableLife {
  slot: number;
  startMs: number;
  endMs: number;
  samples: BipedPosition[];
  xuid: string | null;
}

export function buildLives(positions: readonly BipedPosition[]): BipedLife[] {
  const lives: MutableLife[] = [];
  for (const [slot, list] of groupBySlot(positions, byTimestamp)) {
    let current: MutableLife | null = null;
    for (const position of list) {
      if (current == null || position.timestampMs - current.endMs > LIFE_GAP_MS) {
        current = { slot, startMs: position.timestampMs, endMs: position.timestampMs, samples: [], xuid: null };
        lives.push(current);
      }
      current.endMs = position.timestampMs;
      current.samples.push(position);
    }
  }
  return lives
    .filter((life) => life.samples.length >= MIN_LIFE_SAMPLES)
    .map((life) => ({
      ...life,
      samples: life.samples.map((position) => ({ timestampMs: position.timestampMs, q: position.q })),
    }));
}
