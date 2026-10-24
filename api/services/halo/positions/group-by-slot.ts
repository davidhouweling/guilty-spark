import type { BipedPosition } from "./types";

export function groupBySlot(positions: readonly BipedPosition[]): Map<number, BipedPosition[]> {
  const bySlot = new Map<number, BipedPosition[]>();
  for (const position of positions) {
    const list = bySlot.get(position.slot) ?? [];
    list.push(position);
    bySlot.set(position.slot, list);
  }
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }
  return new Map([...bySlot.entries()].sort((a, b) => a[0] - b[0]));
}
