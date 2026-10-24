import { byTimestamp, groupBySlot } from "./group-by-slot";
import { LIFE_GAP_MS } from "./lives";
import type { BipedPosition } from "./types";

// A live biped replicates continuously, so a sample more than this far from its nearest
// neighbour in the same slot is a chance header match, not part of a life.
export const ISOLATION_GAP_MS = 15_000;
// A quantum step is between 1/120 and 1/60 of a metre, so this bounds speed near 100 m/s on
// any axis: far above a Spartan, grapple or vehicle, and well below a teleporting false match.
export const MAX_AXIS_QUANTA_PER_SECOND = 12_000;
const MAX_REJECT_STREAK = 3;

export function dropIsolated(positions: readonly BipedPosition[]): BipedPosition[] {
  const kept: BipedPosition[] = [];
  for (const list of groupBySlot(positions, byTimestamp).values()) {
    for (const [index, position] of list.entries()) {
      const before = list[index - 1];
      const after = list[index + 1];
      const nearest = Math.min(
        before == null ? Number.POSITIVE_INFINITY : position.timestampMs - before.timestampMs,
        after == null ? Number.POSITIVE_INFINITY : after.timestampMs - position.timestampMs,
      );
      if (nearest <= ISOLATION_GAP_MS) {
        kept.push(position);
      }
    }
  }
  return kept;
}

function axisSpeed(from: BipedPosition, to: BipedPosition): number {
  const elapsedS = (to.timestampMs - from.timestampMs) / 1000;
  const distance = Math.max(...from.q.map((value, axis) => Math.abs((to.q[axis] ?? value) - value)));
  if (elapsedS <= 0) {
    return distance === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return distance / elapsedS;
}

function isTeleport(anchor: BipedPosition | null, position: BipedPosition, streak: number): boolean {
  if (anchor == null || streak >= MAX_REJECT_STREAK || position.timestampMs - anchor.timestampMs > LIFE_GAP_MS) {
    return false;
  }
  return axisSpeed(anchor, position) > MAX_AXIS_QUANTA_PER_SECOND;
}

// after a few consecutive rejections the anchor re-seats on the current sample so a wrong
// anchor cannot condemn the rest of its slot; a silence long enough to open a new life
// re-seats it too, since a respawn lands anywhere on the map
export function dropTeleports(positions: readonly BipedPosition[]): BipedPosition[] {
  const kept: BipedPosition[] = [];
  for (const list of groupBySlot(positions, byTimestamp).values()) {
    let anchor: BipedPosition | null = null;
    let streak = 0;
    for (const position of list) {
      if (isTeleport(anchor, position, streak)) {
        streak += 1;
        continue;
      }
      anchor = position;
      streak = 0;
      kept.push(position);
    }
  }
  return kept;
}
