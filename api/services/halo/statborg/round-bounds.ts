import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { StatRecord } from "./types";

// A round's time window on the film clock, inclusive at both ends; an edge is null where
// nothing bounds it.
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

interface RoundMark extends RoundEmissions {
  startMs: number;
}

function median(values: Iterable<number>): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
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

// A real round is declared by every active slot and a chance match by one, so a round needs
// more than half the slots of the fullest round to count.
function consensusRoundMarks(records: readonly StatRecord[]): RoundMark[] {
  const rounds = [...emissionsByRound(records).values()];
  const fullest = Math.max(0, ...rounds.map((emissions) => emissions.firstBySlot.size));
  return rounds
    .filter((emissions) => emissions.firstBySlot.size * 2 > fullest)
    .map((emissions) => ({ ...emissions, startMs: median(emissions.firstBySlot.values()) }))
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

function earliestAtOrAfter(values: Iterable<number>, floor: number): number | null {
  const candidates = [...values].filter((value) => value >= floor);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function latestAtOrBefore(values: Iterable<number>, ceiling: number): number | null {
  const candidates = [...values].filter((value) => value <= ceiling);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

// The edge between two rounds is the gap no slot emits in: the earlier round ends at its last
// emission before the later round's consensus start, and the later round starts at its first
// emission after the earlier round's consensus end. A stray emission on the far side of the
// other round's consensus moves neither edge.
function closeGap(previous: RoundMark, next: RoundMark, bounds: readonly RoundBounds[], index: number): void {
  const previousConsensusEnd = median(previous.lastBySlot.values());
  if (previousConsensusEnd >= next.startMs) {
    return;
  }
  const previousEnd = latestAtOrBefore(previous.timestamps, next.startMs) ?? previousConsensusEnd;
  const nextStart = earliestAtOrAfter(next.timestamps, previousConsensusEnd) ?? next.startMs;
  if (previousEnd >= nextStart) {
    return;
  }
  Preconditions.checkExists(bounds[index - 1], "every mark has bounds").endMs = previousEnd;
  Preconditions.checkExists(bounds[index], "every mark has bounds").startMs = nextStart;
}

export function resolveRoundBounds(records: readonly StatRecord[]): RoundBounds[] {
  const marks = marksFollowingTheClock(consensusRoundMarks(records));
  const bounds: RoundBounds[] = marks.map((mark) => ({ round: mark.round, startMs: null, endMs: null }));
  for (let index = 1; index < marks.length; index++) {
    const previous = Preconditions.checkExists(marks[index - 1], "index is within the marks");
    const next = Preconditions.checkExists(marks[index], "index is within the marks");
    closeGap(previous, next, bounds, index);
  }
  return bounds;
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

// A record outside its round's window is contradicted only by records of the same slot and
// round inside it; a block that lies entirely outside is a disagreement over the bounds, not a
// misread, and is kept whole.
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
