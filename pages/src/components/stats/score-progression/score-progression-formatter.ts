import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { TeamColor } from "../../team-colors/team-colors";
import type {
  ScoreDeltaData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  ScoreProgressionViewData,
} from "./types";

const FALLBACK_COLORS = ["#888888", "#aaaaaa"];

type KillRaceEvent = NonNullable<MatchAnalytics["scoreProgression"]>["timeline"]["events"][number];

function buildScoreDelta(
  teamIds: readonly number[],
  events: readonly KillRaceEvent[],
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): ScoreDeltaData | null {
  if (teamIds.length < 2 || teamLines.length < 2) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;
  const [line0, line1] = teamLines;

  const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];

  for (const event of events) {
    const score0 = event.runningScores[String(teamId0)] ?? 0;
    const score1 = event.runningScores[String(teamId1)] ?? 0;
    const prevScore = points.at(-1)?.score ?? 0;
    const newScore = score0 - score1;
    points.push({ timestampMs: event.timestampMs, score: prevScore });
    points.push({ timestampMs: event.timestampMs, score: newScore });
  }

  points.push({
    timestampMs: durationMs,
    score: (line0.points.at(-1)?.score ?? 0) - (line1.points.at(-1)?.score ?? 0),
  });

  const scores = points.map((p) => p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;
  const zeroFraction = range === 0 ? 0.5 : maxScore / range;

  return { points, minScore, maxScore, zeroFraction };
}

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
        name: getTeamName(teamId),
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

  return { durationMs, teamLines, scoreDelta: buildScoreDelta(teamIds, events, teamLines, durationMs) };
}
