import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { REGULATION_ROUND } from "./types";
import type { StatRecord } from "./types";

// A round's window on the film clock, inclusive at both ends; an edge is null where nothing
// bounds it.
export interface RoundBounds {
  round: number;
  startMs: number | null;
  endMs: number | null;
}

interface RoundEmissions {
  round: number;
  timestamps: number[];
  firstBySlot: Map<number, number>;
  lastBySlot: Map<number, number>;
}

// a round's consensus start and end: the medians over its slots of their first and last emissions
interface RoundMark extends RoundEmissions {
  startMs: number;
  endMs: number;
}

interface RoundEdges {
  previousEnd: number;
  nextStart: number;
}

function median(values: Iterable<number>): number {
  const sorted = [...values].sort((left, right) => left - right);
  const lower = Preconditions.checkExists(sorted[Math.floor((sorted.length - 1) / 2)], "a median needs a value");
  const upper = Preconditions.checkExists(sorted[Math.floor(sorted.length / 2)], "a median needs a value");
  return (lower + upper) / 2;
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

// every match has a regulation round; a real later round is declared by every active slot and a
// chance match by one, and more than half the fullest round's slots separates the two
function consensusRoundMarks(records: readonly StatRecord[]): RoundMark[] {
  const rounds = [...emissionsByRound(records).values()];
  const fullest = Math.max(0, ...rounds.map((emissions) => emissions.firstBySlot.size));
  return rounds
    .filter((emissions) => emissions.round === REGULATION_ROUND || emissions.firstBySlot.size * 2 > fullest)
    .map((emissions) => ({
      ...emissions,
      startMs: median(emissions.firstBySlot.values()),
      endMs: median(emissions.lastBySlot.values()),
    }))
    .sort((left, right) => left.round - right.round);
}

function marksFollowingTheClock(marks: readonly RoundMark[]): RoundMark[] {
  const kept: RoundMark[] = [];
  for (const mark of marks) {
    if (mark.startMs > (kept.at(-1)?.startMs ?? -Infinity)) {
      kept.push(mark);
    }
  }
  return kept;
}

// The consensus brackets the intermission: the earlier round runs to its last emission before
// the later round's consensus start, the later round from its first emission after the earlier
// round's consensus end. A slot trailing or leading the consensus keeps its emissions; a record
// beyond the other round's consensus is contradicted.
function edgesBetween(previous: RoundMark, next: RoundMark): RoundEdges | null {
  if (previous.endMs >= next.startMs) {
    return null;
  }
  return {
    previousEnd: Preconditions.checkExists(
      latestAtOrBefore(previous.timestamps, next.startMs),
      "half the slots' last emissions precede the consensus end",
    ),
    nextStart: Preconditions.checkExists(
      earliestAtOrAfter(next.timestamps, previous.endMs),
      "half the slots' first emissions follow the consensus start",
    ),
  };
}

export function resolveRoundBounds(records: readonly StatRecord[]): RoundBounds[] {
  const marks = marksFollowingTheClock(consensusRoundMarks(records));
  const edges = marks
    .slice(1)
    .map((next, index) => edgesBetween(Preconditions.checkExists(marks[index], "index is within the marks"), next));
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

function blockKey(record: StatRecord): string {
  return `${String(record.slot)}:${String(record.round)}`;
}

export function filterRecordsByRoundBounds(
  records: readonly StatRecord[],
  bounds: readonly RoundBounds[],
): StatRecord[] {
  const boundsByRound = new Map(bounds.map((entry) => [entry.round, entry]));
  const anchoredBlocks = new Set<string>();
  for (const record of records) {
    const roundBounds = boundsByRound.get(record.round);
    if (roundBounds != null && isWithin(record, roundBounds)) {
      anchoredBlocks.add(blockKey(record));
    }
  }
  return records.filter((record) => {
    const roundBounds = boundsByRound.get(record.round);
    return roundBounds != null && (isWithin(record, roundBounds) || !anchoredBlocks.has(blockKey(record)));
  });
}
