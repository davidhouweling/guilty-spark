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
    // overlapping or out-of-bounds intervals clamp to the untiled remainder of the row
    const intervalStart = Math.max(interval.startMs, cursor);
    const intervalEnd = Math.min(interval.endMs, endMs);
    if (intervalEnd <= intervalStart) {
      continue;
    }
    if (intervalStart > cursor) {
      segments.push({ startMs: cursor, endMs: intervalStart, teamId: null, color: null });
    }
    segments.push({
      startMs: intervalStart,
      endMs: intervalEnd,
      teamId: interval.teamId,
      color: interval.teamId != null ? (teamColorByTeamId.get(interval.teamId) ?? null) : null,
    });
    cursor = intervalEnd;
  }

  if (cursor < endMs) {
    segments.push({ startMs: cursor, endMs: endMs, teamId: null, color: null });
  }

  return mergeAdjacentSegments(segments);
}
