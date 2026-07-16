import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type {
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  ScoreProgressionViewData,
} from "./types";

type KillRaceEvent = NonNullable<MatchAnalytics["scoreProgression"]>["timeline"]["events"][number];
type KillRaceDeathEvent = NonNullable<MatchAnalytics["scoreProgression"]>["timeline"]["deathTimeline"][number];

function buildScoreDelta(
  teamIds: readonly number[],
  events: readonly KillRaceEvent[],
  durationMs: number,
): ScoreDeltaData | null {
  if (teamIds.length < 2) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);

  const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
  let minScore = 0;
  let maxScore = 0;

  for (const event of events) {
    const score0 = event.runningScores[key0] ?? 0;
    const score1 = event.runningScores[key1] ?? 0;
    const score = score0 - score1;
    points.push({ timestampMs: event.timestampMs, score });
    if (score < minScore) {
      minScore = score;
    }
    if (score > maxScore) {
      maxScore = score;
    }
  }

  points.push({ timestampMs: durationMs, score: points.at(-1)?.score ?? 0 });
  const range = maxScore - minScore;
  if (range === 0) {
    return null;
  }
  const zeroFraction = maxScore / range;

  return { points, minScore, maxScore, zeroFraction };
}

function buildPlayerAdvantage(
  teamIds: readonly number[],
  deathTimeline: readonly KillRaceDeathEvent[],
  respawnDurationMs: number,
  durationMs: number,
): PlayerAdvantageData | null {
  if (teamIds.length < 2 || deathTimeline.length === 0) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;

  interface AdvantageEvent { timestampMs: number; teamId: number; delta: 1 | -1 }
  const events: AdvantageEvent[] = [];
  for (const death of deathTimeline) {
    events.push({ timestampMs: death.timestampMs, teamId: death.teamId, delta: 1 });
    const respawnTs = death.timestampMs + respawnDurationMs;
    if (respawnTs < durationMs) {
      events.push({ timestampMs: respawnTs, teamId: death.teamId, delta: -1 });
    }
  }
  events.sort((a, b) => a.timestampMs - b.timestampMs);

  const respawning = new Map<number, number>([
    [teamId0, 0],
    [teamId1, 0],
  ]);
  const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
  let minScore = 0;
  let maxScore = 0;
  let i = 0;

  while (i < events.length) {
    const ts = events[i].timestampMs;
    while (i < events.length && events[i].timestampMs === ts) {
      const { teamId, delta } = events[i];
      respawning.set(teamId, (respawning.get(teamId) ?? 0) + delta);
      i++;
    }
    const score = (respawning.get(teamId1) ?? 0) - (respawning.get(teamId0) ?? 0);
    points.push({ timestampMs: ts, score });
    if (score < minScore) {
      minScore = score;
    }
    if (score > maxScore) {
      maxScore = score;
    }
  }

  points.push({ timestampMs: durationMs, score: points.at(-1)?.score ?? 0 });

  const range = maxScore - minScore;
  if (range === 0) {
    return null;
  }

  return { points, minScore, maxScore, zeroFraction: maxScore / range };
}

export function formatScoreProgression(
  scoreProgression: MatchAnalytics["scoreProgression"],
  teamColors: readonly TeamColor[],
): ScoreProgressionViewData | null {
  if (scoreProgression === null || scoreProgression.timeline.events.length === 0) {
    return null;
  }

  const { durationMs, timeline, respawnDurationMs } = scoreProgression;
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
        color: teamColors[slotIndex]?.hex ?? getTeamColorOrDefault(undefined, slotIndex).hex,
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

  const playerAdvantage =
    respawnDurationMs != null
      ? buildPlayerAdvantage(teamIds, timeline.deathTimeline, respawnDurationMs, durationMs)
      : null;

  return {
    durationMs,
    teamLines,
    scoreDelta: buildScoreDelta(teamIds, events, durationMs),
    playerAdvantage,
  };
}
