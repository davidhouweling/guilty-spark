import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { REGULATION_ROUND } from "./types";
import type { RoundBounds, StatRecord } from "./types";

interface RoundEmissions {
  round: number;
  timestamps: number[];
  firstBySlot: Map<number, number>;
  lastBySlot: Map<number, number>;
}

interface RoundMark {
  round: number;
  timestamps: number[];
  startMs: number;
  endMs: number;
}

function sortedValues(values: Iterable<number>): number[] {
  return [...values].sort((left, right) => left - right);
}

// the lower and upper medians sit on real emissions even when half the slots carry a stray
function lowerMedian(values: Iterable<number>): number {
  const sorted = sortedValues(values);
  return Preconditions.checkExists(sorted[Math.floor((sorted.length - 1) / 2)], "a median needs a value");
}

function upperMedian(values: Iterable<number>): number {
  const sorted = sortedValues(values);
  return Preconditions.checkExists(sorted[Math.floor(sorted.length / 2)], "a median needs a value");
}

function latestAtOrBefore(values: readonly number[], ceiling: number): number | null {
  let latest: number | null = null;
  for (const value of values) {
    if (value <= ceiling && (latest == null || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

function earliestAtOrAfter(values: readonly number[], floor: number): number | null {
  let earliest: number | null = null;
  for (const value of values) {
    if (value >= floor && (earliest == null || value < earliest)) {
      earliest = value;
    }
  }
  return earliest;
}

function emissionsByRound(records: readonly StatRecord[]): Map<number, RoundEmissions> {
  const byRound = new Map<number, RoundEmissions>();
  for (const record of records) {
    const emissions = byRound.get(record.round) ?? {
      round: record.round,
      timestamps: [],
      firstBySlot: new Map<number, number>(),
      lastBySlot: new Map<number, number>(),
    };
    byRound.set(record.round, emissions);
    emissions.timestamps.push(record.timestampMs);
    emissions.firstBySlot.set(
      record.slot,
      Math.min(emissions.firstBySlot.get(record.slot) ?? Infinity, record.timestampMs),
    );
    emissions.lastBySlot.set(
      record.slot,
      Math.max(emissions.lastBySlot.get(record.slot) ?? -Infinity, record.timestampMs),
    );
  }
  return byRound;
}

function isRegulationOrDeclaredByMostSlots(emissions: RoundEmissions, fullestSlotCount: number): boolean {
  return emissions.round === REGULATION_ROUND || emissions.firstBySlot.size * 2 > fullestSlotCount;
}

function consensusRoundMarks(records: readonly StatRecord[]): RoundMark[] {
  const rounds = [...emissionsByRound(records).values()];
  const fullest = Math.max(0, ...rounds.map((emissions) => emissions.firstBySlot.size));
  return rounds
    .filter((emissions) => isRegulationOrDeclaredByMostSlots(emissions, fullest))
    .map((emissions) => ({
      round: emissions.round,
      timestamps: emissions.timestamps,
      startMs: upperMedian(emissions.firstBySlot.values()),
      endMs: lowerMedian(emissions.lastBySlot.values()),
    }))
    .sort((left, right) => left.round - right.round);
}

// rounds are played in order, so a round whose consensus overlaps the round before it is not one
function marksInClockOrder(marks: readonly RoundMark[]): RoundMark[] {
  const kept: RoundMark[] = [];
  for (const mark of marks) {
    if (mark.startMs > (kept.at(-1)?.endMs ?? -Infinity)) {
      kept.push(mark);
    }
  }
  return kept;
}

export function resolveRoundBounds(records: readonly StatRecord[]): RoundBounds[] {
  const marks = marksInClockOrder(consensusRoundMarks(records));
  const edges = marks.slice(1).map((next, index) => {
    const previous = Preconditions.checkExists(marks[index], "a next mark has a previous one");
    return {
      previousEnd: Preconditions.checkExists(
        latestAtOrBefore(previous.timestamps, next.startMs),
        "half the slots' last emissions precede the next consensus start",
      ),
      nextStart: Preconditions.checkExists(
        earliestAtOrAfter(next.timestamps, previous.endMs),
        "half the slots' first emissions follow the previous consensus end",
      ),
    };
  });
  return marks.map((mark, index) => ({
    round: mark.round,
    startMs: edges[index - 1]?.nextStart ?? null,
    endMs: edges[index]?.previousEnd ?? null,
  }));
}

function isWithin(record: StatRecord, bounds: RoundBounds): boolean {
  return (
    (bounds.startMs == null || record.timestampMs >= bounds.startMs) &&
    (bounds.endMs == null || record.timestampMs <= bounds.endMs)
  );
}

export function filterRecordsByRoundBounds(
  records: readonly StatRecord[],
  bounds: readonly RoundBounds[],
): StatRecord[] {
  const boundsByRound = new Map(bounds.map((entry) => [entry.round, entry]));
  return records.filter((record) => {
    const roundBounds = boundsByRound.get(record.round);
    return roundBounds != null && isWithin(record, roundBounds);
  });
}
