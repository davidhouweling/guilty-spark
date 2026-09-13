import type { ParsedHighlightEvent, TeamDeathEvent } from "../types";

export function buildDeathTimeline(
  events: readonly ParsedHighlightEvent[],
  knownTeamIds: ReadonlySet<number>,
  durationMs: number,
): TeamDeathEvent[] {
  const timeline: TeamDeathEvent[] = [];
  for (const event of events) {
    if (
      event.eventType === "death" &&
      event.teamId != null &&
      knownTeamIds.has(event.teamId) &&
      event.timeMs <= durationMs
    ) {
      timeline.push({ timestampMs: event.timeMs, teamId: event.teamId });
    }
  }
  return timeline;
}
