import type { ParsedHighlightEvent } from "../types";
import type { DeathEvent } from "./types";

export function toDeathEvents(events: readonly ParsedHighlightEvent[]): DeathEvent[] {
  return events
    .filter((event) => event.eventType === "death")
    .map((event) => ({ timestampMs: event.timeMs, xuid: event.xuid }));
}
