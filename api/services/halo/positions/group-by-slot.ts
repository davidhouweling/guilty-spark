export function byTimestamp(a: { readonly timestampMs: number }, b: { readonly timestampMs: number }): number {
  return a.timestampMs - b.timestampMs;
}

export function groupBySlot<T extends { readonly slot: number }>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
): Map<number, T[]> {
  const bySlot = new Map<number, T[]>();
  for (const item of items) {
    const list = bySlot.get(item.slot) ?? [];
    list.push(item);
    bySlot.set(item.slot, list);
  }
  for (const list of bySlot.values()) {
    list.sort(compare);
  }
  return new Map([...bySlot.entries()].sort((a, b) => a[0] - b[0]));
}
