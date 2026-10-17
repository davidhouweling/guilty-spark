import type { StatRecord, StatSlotKey } from "./types";

const TEAM_SLOT_MAX = 8;
// A stat counter never jumps by more than a handful per emission; a larger step is a
// parasite emission that slipped through the monotone filter (observed: 64 on a slot
// whose real value was 1).
const MAX_COUNTER_STEP = 1_000;

interface CounterPoint {
  timestampMs: number;
  value: number;
}

export function isTeamSlot(slot: number): boolean {
  return slot <= TEAM_SLOT_MAX;
}

function longestNonDecreasingRun(points: readonly CounterPoint[]): CounterPoint[] {
  const tailIndices: number[] = [];
  const previousIndex: number[] = [];
  for (const [index, point] of points.entries()) {
    let low = 0;
    let high = tailIndices.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const tailPoint = points[tailIndices[mid] ?? -1];
      if (tailPoint != null && tailPoint.value <= point.value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    previousIndex[index] = low > 0 ? (tailIndices[low - 1] ?? -1) : -1;
    if (low === tailIndices.length) {
      tailIndices.push(index);
    } else {
      tailIndices[low] = index;
    }
  }
  const run: CounterPoint[] = [];
  for (let index = tailIndices.at(-1) ?? -1; index >= 0; index = previousIndex[index] ?? -1) {
    const point = points[index];
    if (point != null) {
      run.unshift(point);
    }
  }
  return run;
}

function counterSeriesBySlot(records: readonly StatRecord[], key: StatSlotKey): Map<number, CounterPoint[]> {
  const raw = new Map<number, CounterPoint[]>();
  for (const record of records) {
    if (isTeamSlot(record.slot)) {
      continue;
    }
    const component = record.components.get(key.component);
    if (component == null) {
      continue;
    }
    const value = component[key.side];
    if (value < 0) {
      continue;
    }
    const series = raw.get(record.slot) ?? [];
    series.push({ timestampMs: record.timestampMs, value });
    raw.set(record.slot, series);
  }
  const filtered = new Map<number, CounterPoint[]>();
  for (const [slot, series] of raw) {
    filtered.set(slot, longestNonDecreasingRun(series));
  }
  return filtered;
}

function incrementTimes(series: readonly CounterPoint[]): number[] {
  const times: number[] = [];
  let previous = 0;
  for (const point of series) {
    if (point.value - previous > MAX_COUNTER_STEP) {
      continue;
    }
    for (; previous < point.value; previous++) {
      times.push(point.timestampMs);
    }
  }
  return times;
}

// One timestamp per unit a player counter gained, per player slot: the instant each emission
// raised the counter. Units already acquired before the first emission are dated to it.
export function counterIncrementTimes(records: readonly StatRecord[], key: StatSlotKey): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const [slot, series] of counterSeriesBySlot(records, key)) {
    result.set(slot, incrementTimes(series));
  }
  return result;
}

export function counterTotals(records: readonly StatRecord[], key: StatSlotKey): Map<number, number> {
  const totals = new Map<number, number>();
  for (const [slot, times] of counterIncrementTimes(records, key)) {
    totals.set(slot, times.length);
  }
  return totals;
}
