import { differenceInSeconds, parseISO } from "date-fns";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

const MINIMUM_COMPLETE_GAME_DURATION_SECONDS = 2 * 60;

function getMatchDurationSeconds(entry: TrackerMatchHistoryEntry): number {
  const startTime = parseISO(entry.startTimeIso ?? entry.startTime);
  const endTime = parseISO(entry.endTimeIso ?? entry.endTime);
  return differenceInSeconds(endTime, startTime);
}

export function shouldHideShortDurationMatch(entry: TrackerMatchHistoryEntry): boolean {
  return getMatchDurationSeconds(entry) < MINIMUM_COMPLETE_GAME_DURATION_SECONDS;
}
