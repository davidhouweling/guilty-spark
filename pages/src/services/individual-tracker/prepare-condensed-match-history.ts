import type { CondensedMatchHistoryPage } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { formatMatchScore } from "@guilty-spark/shared/halo/match-enrichment";
import { formatMatchResultString } from "@guilty-spark/shared/halo/match-history";
import { formatDisplayDateTime } from "./match-history-helpers";
import type { PreparedMatchHistoryPage } from "./condensed-match-history-types";

export function prepareCondensedMatchHistory(page: CondensedMatchHistoryPage): PreparedMatchHistoryPage {
  return {
    matches: page.matches.map((match) => ({
      ...match,
      startTime: formatDisplayDateTime(match.startTimeIso),
      endTime: formatDisplayDateTime(match.endTimeIso),
      duration: getReadableDuration(match.durationIso),
      resultString: formatMatchResultString(match.outcome, match.score?.scores ?? null),
      scoreDisplay: match.score == null ? null : formatMatchScore(match.score.scores, match.score.roundsWon),
    })),
    suggestedGroupings: page.suggestedGroupings,
  };
}
