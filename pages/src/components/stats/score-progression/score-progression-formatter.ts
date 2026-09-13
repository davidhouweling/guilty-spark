import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { DeathOverlay, KillRaceEvent, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import { extendToDuration } from "./extend-to-duration";
import { buildKothCaptureEvents, buildKothHills } from "./modes/koth/koth-view-model";
import { buildOddballRounds, buildOddballScoreSeries } from "./modes/oddball/oddball-view-model";
import { buildStrongholdsMarkers, buildZoneAdvantage } from "./modes/strongholds/strongholds-view-model";
import { buildSampledTeamLines } from "./sampled-team-lines";
import type {
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreLinesViewData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  ScoreProgressionViewData,
  ScoreSample,
} from "./types";

function buildScoreDelta(
  teamIds: readonly number[],
  events: readonly ScoreSample[],
  durationMs: number,
  lineType: ScoreDeltaData["lineType"],
): ScoreDeltaData | null {
  if (teamIds.length !== 2) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);

  // trailing film events past the match end would leave an out-of-range sample and suppress
  // the terminal point
  const inMatchEvents = events.filter((event) => event.timestampMs <= durationMs);
  const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
  let minScore = 0;
  let maxScore = 0;
  let score0 = 0;
  let score1 = 0;

  for (const event of inMatchEvents) {
    // a team omitted from a sparse record carries its previous score forward (scores never drop)
    score0 = key0 in event.runningScores ? event.runningScores[key0] : score0;
    score1 = key1 in event.runningScores ? event.runningScores[key1] : score1;
    const score = score0 - score1;
    points.push({ timestampMs: event.timestampMs, score });
    if (score < minScore) {
      minScore = score;
    }
    if (score > maxScore) {
      maxScore = score;
    }
  }

  extendToDuration(points, durationMs);
  const range = maxScore - minScore;
  if (range === 0) {
    return null;
  }

  return { points, minScore, maxScore, lineType };
}

function buildPlayerAdvantage(
  teamIds: readonly number[],
  { deathTimeline, respawnDurationMs }: DeathOverlay,
  durationMs: number,
  teamSize: number | null,
): PlayerAdvantageData | null {
  if (respawnDurationMs == null) {
    return null;
  }
  // producers clamp server-side; kept as boundary defense for payloads from an older api deploy
  const inMatchDeaths = deathTimeline.filter((death) => death.timestampMs <= durationMs);
  if (teamIds.length !== 2 || inMatchDeaths.length === 0) {
    return null;
  }

  const [teamId0, teamId1] = teamIds;

  interface AdvantageEvent {
    timestampMs: number;
    teamId: number;
    delta: 1 | -1;
  }
  const events: AdvantageEvent[] = [];
  for (const death of inMatchDeaths) {
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

  extendToDuration(points, durationMs);

  const range = maxScore - minScore;
  if (range === 0) {
    return null;
  }

  if (teamSize != null) {
    return { points, minScore: -teamSize, maxScore: teamSize };
  }
  return { points, minScore, maxScore };
}

function buildTeamLines(
  events: readonly KillRaceEvent[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ScoreProgressionTeamLine[] {
  const teamState = new Map(
    teamIds.map((teamId, slotIndex) => [
      teamId,
      {
        name: getTeamName(teamId),
        color: teamColorByTeamId.get(teamId) ?? getTeamColorOrDefault(undefined, slotIndex).hex,
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
    extendToDuration(state.points, durationMs);
    teamLines.push({ teamId, name: state.name, color: state.color, points: state.points });
  }
  return teamLines;
}

interface ResolvedTeams {
  readonly teamIds: number[];
  readonly teamColorByTeamId: Map<number, string>;
}

function buildStepScoreLines(
  events: readonly KillRaceEvent[],
  teams: ResolvedTeams,
  overlaySource: DeathOverlay,
  durationMs: number,
  teamSize: number | null,
): ScoreLinesViewData {
  return {
    kind: "score-lines",
    durationMs,
    teamLines: buildTeamLines(events, teams.teamIds, teams.teamColorByTeamId, durationMs),
    scoreDelta: buildScoreDelta(teams.teamIds, events, durationMs, "step"),
    playerAdvantage: buildPlayerAdvantage(teams.teamIds, overlaySource, durationMs, teamSize),
    markers: null,
    zoneAdvantage: null,
    roundBoundaries: [],
  };
}

function resolveTeams(
  scoresByTeamId: Record<string, number> | undefined,
  teamColors: readonly TeamColor[],
): ResolvedTeams | null {
  if (scoresByTeamId == null) {
    return null;
  }
  const teamIds = Object.keys(scoresByTeamId)
    .map(Number)
    .sort((a, b) => a - b);
  if (teamIds.length === 0) {
    return null;
  }
  const teamColorByTeamId = new Map(
    teamIds.map((teamId, slotIndex) => [
      teamId,
      teamColors[slotIndex]?.hex ?? getTeamColorOrDefault(undefined, slotIndex).hex,
    ]),
  );
  return { teamIds, teamColorByTeamId };
}

export function formatScoreProgression(
  scoreProgression: MatchAnalytics["scoreProgression"],
  teamColors: readonly TeamColor[],
  teamSize: number | null = null,
): ScoreProgressionViewData | null {
  if (scoreProgression === null) {
    return null;
  }

  const { durationMs, timeline } = scoreProgression;

  switch (timeline.type) {
    case "kill-race": {
      const teams = resolveTeams(timeline.events.at(0)?.runningScores, teamColors);
      if (teams == null) {
        return null;
      }
      // a trailing film event past the match end would push the lines beyond the x-axis
      const inMatchEvents = timeline.events.filter((event) => event.timestampMs <= durationMs);
      return buildStepScoreLines(inMatchEvents, teams, timeline, durationMs, teamSize);
    }
    case "koth": {
      const teams = resolveTeams(timeline.events.at(0)?.runningScores, teamColors);
      if (teams == null) {
        return null;
      }
      const hills = buildKothHills(timeline, teams.teamIds, teams.teamColorByTeamId, durationMs);
      const captureEvents = buildKothCaptureEvents(hills, teams.teamIds);
      const scoreLines: ScoreLinesViewData | null =
        captureEvents.length > 0 ? buildStepScoreLines(captureEvents, teams, timeline, durationMs, teamSize) : null;
      return {
        kind: "koth",
        durationMs,
        hills,
        scoreLines,
      };
    }
    case "oddball": {
      // round score records may be sparse, so a team missing from one round must still resolve —
      // union the scores across all rounds
      const mergedRoundScores: Record<string, number> = {};
      for (const round of timeline.rounds) {
        Object.assign(mergedRoundScores, round.scores);
      }
      const teams = resolveTeams(timeline.rounds.length > 0 ? mergedRoundScores : undefined, teamColors);
      if (teams == null) {
        return null;
      }
      const { samples, roundBoundaries } = buildOddballScoreSeries(timeline, teams.teamIds, durationMs);
      const scoreLines: ScoreLinesViewData | null =
        samples.length > 0
          ? {
              kind: "score-lines",
              durationMs,
              teamLines: buildSampledTeamLines(samples, teams.teamIds, teams.teamColorByTeamId, durationMs),
              scoreDelta: buildScoreDelta(teams.teamIds, samples, durationMs, "linear"),
              playerAdvantage: buildPlayerAdvantage(teams.teamIds, timeline, durationMs, teamSize),
              markers: null,
              zoneAdvantage: null,
              roundBoundaries,
            }
          : null;
      return {
        kind: "oddball",
        durationMs,
        rounds: buildOddballRounds(timeline, teams.teamIds, teams.teamColorByTeamId),
        scoreLines,
      };
    }
    case "strongholds": {
      // strongholds records may be sparse, so a team missing from the first sample must still
      // resolve — union the scores across all samples
      const mergedScores: Record<string, number> = {};
      for (const event of timeline.events) {
        Object.assign(mergedScores, event.runningScores);
      }
      const teams = resolveTeams(timeline.events.length > 0 ? mergedScores : undefined, teamColors);
      if (teams == null) {
        return null;
      }
      const teamLines = buildSampledTeamLines(timeline.events, teams.teamIds, teams.teamColorByTeamId, durationMs);
      // null rather than an empty array so "no markers" reads the same as modes without markers
      const markers = buildStrongholdsMarkers(timeline.zoneEvents, teamLines, durationMs);
      return {
        kind: "score-lines",
        durationMs,
        teamLines,
        scoreDelta: buildScoreDelta(teams.teamIds, timeline.events, durationMs, "linear"),
        playerAdvantage: buildPlayerAdvantage(teams.teamIds, timeline, durationMs, teamSize),
        markers: markers.length > 0 ? markers : null,
        zoneAdvantage: buildZoneAdvantage(timeline.zoneTimeline, teams.teamIds, durationMs),
        roundBoundaries: [],
      };
    }
    default: {
      throw new UnreachableError(timeline);
    }
  }
}
