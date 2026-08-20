import { GameVariantCategory } from "halo-infinite-api";
import type {
  KillRaceDeathEvent,
  KillRaceEvent,
  MatchAnalytics,
  ObjectiveControlTimeline,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import { TICK_FILL } from "./chart-constants";
import type {
  KothHillData,
  KothHillSegment,
  KothHillTeamProgress,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  ScoreProgressionViewData,
} from "./types";

const MIN_TRAILING_HILL_MS = 2_000;

function buildScoreDelta(
  teamIds: readonly number[],
  events: readonly KillRaceEvent[],
  durationMs: number,
): ScoreDeltaData | null {
  if (teamIds.length !== 2) {
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

  return { points, minScore, maxScore };
}

function buildPlayerAdvantage(
  teamIds: readonly number[],
  deathTimeline: readonly KillRaceDeathEvent[],
  respawnDurationMs: number,
  durationMs: number,
  teamSize: number | null,
): PlayerAdvantageData | null {
  if (teamIds.length !== 2 || deathTimeline.length === 0) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;

  interface AdvantageEvent {
    timestampMs: number;
    teamId: number;
    delta: 1 | -1;
  }
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

  if (teamSize != null) {
    return { points, minScore: -teamSize, maxScore: teamSize };
  }
  return { points, minScore, maxScore };
}

function buildHillSegments(
  hillStart: number,
  hillEnd: number,
  timeline: ObjectiveControlTimeline,
  teamColorByTeamId: Map<number, string>,
): KothHillSegment[] {
  const overlapping = timeline.controlPeriods
    .filter((cp) => cp.endMs > hillStart && cp.startMs < hillEnd)
    .map((cp) => ({
      startMs: Math.max(cp.startMs, hillStart),
      endMs: Math.min(cp.endMs, hillEnd),
      controllingTeamId: cp.controllingTeamId,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const segments: KothHillSegment[] = [];
  let cursor = hillStart;

  for (const cp of overlapping) {
    if (cp.startMs > cursor) {
      segments.push({ startMs: cursor, endMs: cp.startMs, teamId: null, color: null });
    }
    segments.push({
      startMs: cp.startMs,
      endMs: cp.endMs,
      teamId: cp.controllingTeamId,
      color: cp.controllingTeamId != null ? (teamColorByTeamId.get(cp.controllingTeamId) ?? null) : null,
    });
    cursor = cp.endMs;
  }

  if (cursor < hillEnd) {
    segments.push({ startMs: cursor, endMs: hillEnd, teamId: null, color: null });
  }

  return segments;
}

// The capture meter fills over 8 scoring ticks (~5s each, the 40s HCS meter) — mirrors the
// constants in api/services/halo/koth-capture-search.ts. The winner's meter completed by
// definition; a loser's meter is estimated from their scoring ticks inside the hill and capped
// below 100 so it can never read as a capture.
const METER_TICKS_PER_CAPTURE = 8;

function buildCaptureMeterPercentage(
  events: ObjectiveControlTimeline["events"],
  teamId: number,
  hillStartMs: number,
  hillEndMs: number,
  winnerTeamId: number | null,
): number {
  if (teamId === winnerTeamId) {
    return 100;
  }
  const key = String(teamId);
  const cumulativeAt = (timestampMs: number): number =>
    events.findLast((event) => event.timestampMs <= timestampMs)?.runningScores[key] ?? 0;
  const ticksInHill = cumulativeAt(hillEndMs) - cumulativeAt(hillStartMs);
  return Math.min(99, Math.round((ticksInHill / METER_TICKS_PER_CAPTURE) * 100));
}

function buildKothHills(
  timeline: ObjectiveControlTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): KothHillData[] {
  const { hillCaptureTimestamps } = timeline;

  interface HillPeriod {
    startMs: number;
    endMs: number;
    isCaptured: boolean;
  }

  const hillPeriods: HillPeriod[] = [];
  let hillStart = 0;
  for (const captureTs of hillCaptureTimestamps) {
    hillPeriods.push({ startMs: hillStart, endMs: captureTs, isCaptured: true });
    hillStart = captureTs;
  }
  // A match that ends on a capture leaves a sliver between the final capture and the film end;
  // that sliver is not a real hill, so only keep a trailing hill the teams actually contested.
  if (durationMs - hillStart >= MIN_TRAILING_HILL_MS) {
    hillPeriods.push({ startMs: hillStart, endMs: durationMs, isCaptured: false });
  }

  return hillPeriods.map((period, periodIndex) => {
    const segments = buildHillSegments(period.startMs, period.endMs, timeline, teamColorByTeamId);

    // hillCaptureTimestamps entries are the capturing team's last score-event timestamp,
    // so the event at period.endMs directly identifies the winner.
    const capturingEvent = period.isCaptured ? timeline.events.findLast((e) => e.timestampMs === period.endMs) : null;
    const winnerTeamId = capturingEvent?.teamId ?? null;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: KothHillTeamProgress[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(timeline.events, teamId, period.startMs, period.endMs, winnerTeamId),
    }));

    return {
      hillIndex: periodIndex + 1,
      startMs: period.startMs,
      endMs: period.endMs,
      segments,
      winnerTeamId,
      winnerColor,
      winnerName,
      teamCaptureProgress,
    };
  });
}

export function formatScoreProgression(
  scoreProgression: MatchAnalytics["scoreProgression"],
  teamColors: readonly TeamColor[],
  teamSize: number | null = null,
): ScoreProgressionViewData | null {
  if (scoreProgression === null || scoreProgression.timeline.events.length === 0) {
    return null;
  }

  const { mode, durationMs, timeline, respawnDurationMs } = scoreProgression;
  const { events } = timeline;

  const [firstEvent] = events;
  const teamIds = Object.keys(firstEvent.runningScores)
    .map(Number)
    .sort((a, b) => a - b);

  const kothMode: number = GameVariantCategory.MultiplayerKingOfTheHill;
  if (mode === kothMode && timeline.type === "objective-control") {
    const teamColorByTeamId = new Map(
      teamIds.map((teamId, slotIndex) => [
        teamId,
        teamColors[slotIndex]?.hex ?? getTeamColorOrDefault(undefined, slotIndex).hex,
      ]),
    );
    return {
      durationMs,
      teamLines: [],
      scoreDelta: null,
      playerAdvantage: null,
      kothHills: buildKothHills(timeline, teamIds, teamColorByTeamId, durationMs),
    };
  }

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
    respawnDurationMs != null && timeline.type === "kill-race"
      ? buildPlayerAdvantage(teamIds, timeline.deathTimeline, respawnDurationMs, durationMs, teamSize)
      : null;

  return {
    durationMs,
    teamLines,
    scoreDelta: buildScoreDelta(teamIds, events, durationMs),
    playerAdvantage,
    kothHills: null,
  };
}
