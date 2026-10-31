import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { StatRecord } from "./types";

// A round's window on the film clock, [startMs, endMs); an edge is null where nothing bounds it.
export interface RoundBounds {
  round: number;
  startMs: number | null;
  endMs: number | null;
}

interface RoundEmissions {
  round: number;
  firstBySlot: Map<number, number>;
  lastBySlot: Map<number, number>;
}

// a round's consensus start and end: the medians over its slots of their first and last emissions
interface RoundMark {
  round: number;
  startMs: number;
  endMs: number;
}

const REGULATION_ROUND = 0;

function median(values: Iterable<number>): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function emissionsByRound(records: readonly StatRecord[]): Map<number, RoundEmissions> {
  const byRound = new Map<number, RoundEmissions>();
  for (const record of records) {
    const emissions = byRound.get(record.round) ?? {
      round: record.round,
      firstBySlot: new Map<number, number>(),
      lastBySlot: new Map<number, number>(),
    };
    byRound.set(record.round, emissions);
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

// every match has a regulation round; any other round is declared by every active slot when
// real and by one when it is a chance match
function consensusRoundMarks(records: readonly StatRecord[]): RoundMark[] {
  const rounds = [...emissionsByRound(records).values()];
  const fullest = Math.max(0, ...rounds.map((emissions) => emissions.firstBySlot.size));
  return rounds
    .filter((emissions) => emissions.round === REGULATION_ROUND || emissions.firstBySlot.size * 2 > fullest)
    .map((emissions) => ({
      round: emissions.round,
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

// the edge sits in the middle of the intermission the consensus brackets, so a slot trailing
// or leading the consensus keeps its emissions while a record on the far side is contradicted
function edgeBetween(previous: RoundMark, next: RoundMark): number | null {
  return previous.endMs < next.startMs ? Math.floor((previous.endMs + next.startMs) / 2) : null;
}

export function resolveRoundBounds(records: readonly StatRecord[]): RoundBounds[] {
  const marks = marksFollowingTheClock(consensusRoundMarks(records));
  const edges = marks
    .slice(1)
    .map((next, index) => edgeBetween(Preconditions.checkExists(marks[index], "index is within the marks"), next));
  return marks.map((mark, index) => ({
    round: mark.round,
    startMs: edges[index - 1] ?? null,
    endMs: edges[index] ?? null,
  }));
}

function isWithin(record: StatRecord, bounds: RoundBounds): boolean {
  return (
    (bounds.startMs == null || record.timestampMs >= bounds.startMs) &&
    (bounds.endMs == null || record.timestampMs < bounds.endMs)
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
