import { GameVariantCategory } from "halo-infinite-api";
import type {
  KillRaceDeathEvent,
  KillRaceEvent,
  MatchAnalytics,
  ObjectiveControlEvent,
  ObjectiveControlPeriod,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type {
  KothHillData,
  KothHillSegment,
  ObjectiveControlPeriodDisplay,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  ScoreProgressionViewData,
  KothHillTeamOccupancy,
} from "./types";

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

type Timeline = NonNullable<MatchAnalytics["scoreProgression"]>["timeline"];

function buildControlPeriods(
  timeline: Timeline,
  teamColorByTeamId: Map<number, string>,
): readonly ObjectiveControlPeriodDisplay[] {
  if (timeline.type !== "objective-control") {
    return [];
  }
  return timeline.controlPeriods.map((period) => ({
    startMs: period.startMs,
    endMs: period.endMs,
    color: period.controllingTeamId != null ? (teamColorByTeamId.get(period.controllingTeamId) ?? null) : null,
  }));
}

const KOTH_TICK_MS = 2_500;

function deriveHillSegments(
  periodEvents: readonly ObjectiveControlEvent[],
  period: ObjectiveControlPeriod,
  teamColorByTeamId: Map<number, string>,
): KothHillSegment[] {
  if (periodEvents.length === 0) {
    return [{ startMs: period.startMs, endMs: period.endMs, teamId: null, color: null }];
  }

  const segments: KothHillSegment[] = [];
  const firstEvent = Preconditions.checkExists(periodEvents[0]);
  const startGap = firstEvent.timestampMs - period.startMs;
  const segmentStart = startGap <= KOTH_TICK_MS ? period.startMs : firstEvent.timestampMs;

  if (segmentStart > period.startMs) {
    segments.push({ startMs: period.startMs, endMs: segmentStart, teamId: null, color: null });
  }

  let currentTeamId = firstEvent.teamId;
  let currentSegmentStart = segmentStart;

  for (let i = 1; i < periodEvents.length; i++) {
    const event = Preconditions.checkExists(periodEvents[i]);
    const prevEvent = Preconditions.checkExists(periodEvents[i - 1]);
    const gap = event.timestampMs - prevEvent.timestampMs;

    if (event.teamId !== currentTeamId || gap > KOTH_TICK_MS * 2) {
      const prevEnd = Math.min(prevEvent.timestampMs + KOTH_TICK_MS, event.timestampMs);
      segments.push({
        startMs: currentSegmentStart,
        endMs: prevEnd,
        teamId: currentTeamId,
        color: teamColorByTeamId.get(currentTeamId) ?? null,
      });
      if (prevEnd < event.timestampMs) {
        segments.push({ startMs: prevEnd, endMs: event.timestampMs, teamId: null, color: null });
      }
      currentTeamId = event.teamId;
      currentSegmentStart = event.timestampMs;
    }
  }

  const lastEvent = Preconditions.checkExists(periodEvents.at(-1));
  const lastEnd = Math.min(lastEvent.timestampMs + KOTH_TICK_MS, period.endMs);
  segments.push({
    startMs: currentSegmentStart,
    endMs: lastEnd,
    teamId: currentTeamId,
    color: teamColorByTeamId.get(currentTeamId) ?? null,
  });
  if (lastEnd < period.endMs) {
    segments.push({ startMs: lastEnd, endMs: period.endMs, teamId: null, color: null });
  }

  return segments;
}

function buildKothHills(
  events: readonly ObjectiveControlEvent[],
  controlPeriods: readonly ObjectiveControlPeriod[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
): KothHillData[] {
  // Skip periods that end before the first mode event — these are pre-game
  // transitions before any hill became contestable.
  const firstEventTime = events.reduce((min, e) => Math.min(min, e.timestampMs), Infinity);
  const hillPeriods = controlPeriods.filter((p) => p.endMs > firstEventTime);

  return hillPeriods.map((period, periodIndex) => {
    const periodEvents = events
      .filter((e) => e.timestampMs >= period.startMs && e.timestampMs < period.endMs)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    const segments = deriveHillSegments(periodEvents, period, teamColorByTeamId);

    const lastEvent = periodEvents.at(-1);
    const winnerTeamId = lastEvent?.teamId ?? null;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const hillDurationMs = period.endMs - period.startMs;
    const holdMs = new Map<number, number>(teamIds.map((id) => [id, 0]));
    for (const segment of segments) {
      if (segment.teamId != null) {
        holdMs.set(segment.teamId, (holdMs.get(segment.teamId) ?? 0) + (segment.endMs - segment.startMs));
      }
    }

    const teamOccupancies: KothHillTeamOccupancy[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: Preconditions.checkExists(teamColorByTeamId.get(teamId)),
      percentage: hillDurationMs > 0 ? Math.round(((holdMs.get(teamId) ?? 0) / hillDurationMs) * 100) : 0,
    }));

    return {
      hillIndex: periodIndex + 1,
      startMs: period.startMs,
      endMs: period.endMs,
      segments,
      winnerTeamId,
      winnerColor,
      winnerName,
      teamOccupancies,
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

  const teamColorByTeamId = new Map([...teamState.entries()].map(([teamId, state]) => [teamId, state.color]));

  const kothMode: number = GameVariantCategory.MultiplayerKingOfTheHill;
  if (mode === kothMode && timeline.type === "objective-control" && timeline.controlPeriods.length > 0) {
    return {
      durationMs,
      teamLines: [],
      scoreDelta: null,
      playerAdvantage: null,
      controlPeriods: [],
      kothHills: buildKothHills(timeline.events, timeline.controlPeriods, teamIds, teamColorByTeamId),
    };
  }

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
    controlPeriods: buildControlPeriods(timeline, teamColorByTeamId),
    kothHills: null,
  };
}
