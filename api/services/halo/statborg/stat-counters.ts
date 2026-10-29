import type { StatRecord, StatSlotKey } from "./types";

const TEAM_SLOT_MAX = 8;
// An emission only ever adds a handful of units; a larger step is a parasite that slipped
// through the monotone filter (observed: 64 on a slot whose real value was 1). Totals accept a
// large first value so a slot first replicated late still matches the roster, but no event
// timestamps are fabricated for it.
const MAX_INITIAL_COUNTER = 1_000;
const MAX_COUNTER_STEP = 10;

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
      run.push(point);
    }
  }
  return run.reverse();
}

// A slot that only ever emitted negative (parasite) values keeps an empty series, so its
// total reads as rejected rather than as never emitted.
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
    const series = raw.get(record.slot) ?? [];
    raw.set(record.slot, series);
    const value = component[key.side];
    if (value >= 0) {
      series.push({ timestampMs: record.timestampMs, value });
    }
  }
  const filtered = new Map<number, CounterPoint[]>();
  for (const [slot, series] of raw) {
    series.sort((left, right) => left.timestampMs - right.timestampMs);
    filtered.set(slot, longestNonDecreasingRun(series));
  }
  return filtered;
}

// Every emission marks the instant its counter changed, so exactly one unit is dated per
// plausible increase; units the emission skipped over (missed frames, a late first
// replication) get no timestamp rather than a fabricated one.
function incrementTimes(series: readonly CounterPoint[]): number[] {
  const times: number[] = [];
  let previous = 0;
  for (const point of series) {
    const step = point.value - previous;
    if (step > 0 && step <= MAX_COUNTER_STEP) {
      times.push(point.timestampMs);
    }
    previous = point.value;
  }
  return times;
}

export function counterIncrementTimes(records: readonly StatRecord[], key: StatSlotKey): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const [slot, series] of counterSeriesBySlot(records, key)) {
    result.set(slot, incrementTimes(series));
  }
  return result;
}

// A jump larger than a plausible step is kept only when the series keeps climbing after it
// (missed emissions), and rejected when it merely persists or ends the series (a parasite).
function finalCounterPoint(series: readonly CounterPoint[]): CounterPoint | null {
  const [first] = series;
  if (first == null || first.value > MAX_INITIAL_COUNTER) {
    return null;
  }
  let final = first;
  for (const [index, point] of series.entries()) {
    if (index === 0) {
      continue;
    }
    const step = point.value - final.value;
    if (step <= MAX_COUNTER_STEP) {
      final = point;
      continue;
    }
    const next = series.slice(index + 1).find((later) => later.value !== point.value);
    const continues = next != null && next.value > point.value && next.value - point.value <= MAX_COUNTER_STEP;
    if (!continues) {
      return final;
    }
    final = point;
  }
  return final;
}

// Final values survive missed emissions mid-series, which is why slot identity matches on
// them; only a first emission beyond any plausible counter or a trailing implausible jump is
// rejected, and such a slot reports null so callers can tell "rejected" from "never emitted".
export function counterTotals(records: readonly StatRecord[], key: StatSlotKey): Map<number, number | null> {
  const totals = new Map<number, number | null>();
  for (const [slot, series] of counterSeriesBySlot(records, key)) {
    totals.set(slot, finalCounterPoint(series)?.value ?? null);
  }
  return totals;
}

// when each slot's counter last plausibly emitted its final value
export function counterFinalTimes(records: readonly StatRecord[], key: StatSlotKey): Map<number, number | null> {
  const times = new Map<number, number | null>();
  for (const [slot, series] of counterSeriesBySlot(records, key)) {
    times.set(slot, finalCounterPoint(series)?.timestampMs ?? null);
  }
  return times;
}
