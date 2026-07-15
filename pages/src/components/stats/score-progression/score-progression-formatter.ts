import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { TeamColor } from "../../team-colors/team-colors";
import type { ScoreProgressionPoint, ScoreProgressionTeamLine, ScoreProgressionViewData } from "./types";

const FALLBACK_COLORS = ["#888888", "#aaaaaa"];

export function formatScoreProgression(
  scoreProgression: MatchAnalytics["scoreProgression"],
  teamColors: readonly TeamColor[],
): ScoreProgressionViewData | null {
  if (scoreProgression === null || scoreProgression.timeline.events.length === 0) {
    return null;
  }

  const { durationMs, timeline } = scoreProgression;
  const { events } = timeline;

  const [firstEvent] = events;
  const teamIds = Object.keys(firstEvent.runningScores)
    .map(Number)
    .sort((a, b) => a - b);

  const teamState = new Map(
    teamIds.map((teamId, slotIndex) => [
      teamId,
      {
        name: teamColors[slotIndex]?.name ?? `Team ${String(slotIndex + 1)}`,
        color: teamColors[slotIndex]?.hex ?? FALLBACK_COLORS[slotIndex % FALLBACK_COLORS.length],
        prevScore: 0,
        points: [{ timestampMs: 0, score: 0 }] as ScoreProgressionPoint[],
      },
    ]),
  );

  for (const event of events) {
    const newScore = event.runningScores[String(event.teamId)] ?? 0;

    for (const [teamId, state] of teamState) {
      if (teamId === event.teamId) {
        state.points.push({ timestampMs: event.timestampMs, score: state.prevScore });
        state.points.push({ timestampMs: event.timestampMs, score: newScore });
        state.prevScore = newScore;
      } else {
        state.points.push({ timestampMs: event.timestampMs, score: state.prevScore });
      }
    }
  }

  const teamLines: ScoreProgressionTeamLine[] = [];
  for (const [teamId, state] of teamState) {
    state.points.push({ timestampMs: durationMs, score: state.prevScore });
    teamLines.push({ teamId, name: state.name, color: state.color, points: state.points });
  }

  return { durationMs, teamLines };
}
