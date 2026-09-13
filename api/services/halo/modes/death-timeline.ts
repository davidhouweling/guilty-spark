import type { ParsedHighlightEvent, TeamDeathEvent } from "../types";

export function buildDeathTimeline(
  events: readonly ParsedHighlightEvent[],
  knownTeamIds: ReadonlySet<number>,
): TeamDeathEvent[] {
  const timeline: TeamDeathEvent[] = [];
  for (const event of events) {
    if (event.eventType === "death" && event.teamId != null && knownTeamIds.has(event.teamId)) {
      timeline.push({ timestampMs: event.timeMs, teamId: event.teamId });
    }
  }
  return timeline;
}
