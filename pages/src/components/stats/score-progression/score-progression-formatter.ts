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

  const teamLines: ScoreProgressionTeamLine[] = teamIds.map((teamId) => {
    const color = teamColors[teamId]?.hex ?? FALLBACK_COLORS[teamId % FALLBACK_COLORS.length];
    const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
    let prevScore = 0;

    for (const event of events) {
      if (event.teamId !== teamId) {
        continue;
      }
      const newScore = event.runningScores[String(teamId)] ?? prevScore;
      points.push({ timestampMs: event.timestampMs, score: prevScore });
      points.push({ timestampMs: event.timestampMs, score: newScore });
      prevScore = newScore;
    }

    points.push({ timestampMs: durationMs, score: prevScore });
    return { teamId, color, points };
  });

  return { durationMs, teamLines };
}
