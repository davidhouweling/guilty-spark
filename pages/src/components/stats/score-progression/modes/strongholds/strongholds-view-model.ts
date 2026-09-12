import type { StrongholdsEvent } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../../../team-colors/team-colors";
import type { ScoreProgressionPoint, ScoreProgressionTeamLine } from "../../types";

// Strongholds scores accrue continuously (1-2 points per second while holding zones), so its
// lines are ramps between rate boundaries rather than the stepped lines kill events produce.
// A team missing from an event's record carries its previous score forward (scores never drop).
export function buildStrongholdsTeamLines(
  events: readonly StrongholdsEvent[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ScoreProgressionTeamLine[] {
  // the contract permits samples past the match end; keep the line inside the chart's x-axis
  const inMatchEvents = events.filter((event) => event.timestampMs <= durationMs);
  return teamIds.map((teamId, slotIndex) => {
    const key = String(teamId);
    const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
    for (const event of inMatchEvents) {
      const previous = points.at(-1);
      const score = key in event.runningScores ? event.runningScores[key] : (previous?.score ?? 0);
      points.push({ timestampMs: event.timestampMs, score });
    }
    const last = points.at(-1);
    if (last != null && last.timestampMs < durationMs) {
      points.push({ timestampMs: durationMs, score: last.score });
    }
    return {
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? getTeamColorOrDefault(undefined, slotIndex).hex,
      points,
    };
  });
}
