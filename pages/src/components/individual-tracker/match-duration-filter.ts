import { differenceInSeconds, isValid, parseISO } from "date-fns";
import { MINIMUM_COMPLETE_MATCH_DURATION_SECONDS } from "@guilty-spark/shared/halo/duration";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

function getMatchDurationSeconds(entry: TrackerMatchHistoryEntry): number | undefined {
  const startRaw = entry.startTimeIso ?? entry.startTime;
  const endRaw = entry.endTimeIso ?? entry.endTime;
  const startTime = parseISO(startRaw);
  const endTime = parseISO(endRaw);
  if (!isValid(startTime) || !isValid(endTime)) {
    return undefined;
  }
  return differenceInSeconds(endTime, startTime);
}

export function shouldHideShortDurationMatch(entry: TrackerMatchHistoryEntry): boolean {
  const duration = getMatchDurationSeconds(entry);
  if (duration === undefined) {
    return false;
  }
  return duration < MINIMUM_COMPLETE_MATCH_DURATION_SECONDS;
}
