import type { TimelineGanttSegment } from "./types";

export interface OccupiedInterval {
  readonly startMs: number;
  readonly endMs: number;
  readonly teamId: number | null;
}

function mergeAdjacentSegments(segments: readonly TimelineGanttSegment[]): TimelineGanttSegment[] {
  const merged: TimelineGanttSegment[] = [];
  for (const segment of segments) {
    const previous = merged.pop();
    if (previous == null) {
      merged.push(segment);
    } else if (previous.teamId === segment.teamId && previous.endMs === segment.startMs) {
      merged.push({ ...previous, endMs: segment.endMs });
    } else {
      merged.push(previous, segment);
    }
  }
  return merged;
}

// Tiles a row from its occupied intervals: gaps become unoccupied segments so the segments
// cover [startMs, endMs] without gaps or overlaps, then adjacent same-team segments merge.
export function tileSegments(
  startMs: number,
  endMs: number,
  occupied: readonly OccupiedInterval[],
  teamColorByTeamId: Map<number, string>,
): TimelineGanttSegment[] {
  const ordered = [...occupied].sort((a, b) => a.startMs - b.startMs);
  const segments: TimelineGanttSegment[] = [];
  let cursor = startMs;

  for (const interval of ordered) {
    if (interval.startMs > cursor) {
      segments.push({ startMs: cursor, endMs: interval.startMs, teamId: null, color: null });
    }
    segments.push({
      startMs: interval.startMs,
      endMs: interval.endMs,
      teamId: interval.teamId,
      color: interval.teamId != null ? (teamColorByTeamId.get(interval.teamId) ?? null) : null,
    });
    cursor = interval.endMs;
  }

  if (cursor < endMs) {
    segments.push({ startMs: cursor, endMs: endMs, teamId: null, color: null });
  }

  return mergeAdjacentSegments(segments);
}
