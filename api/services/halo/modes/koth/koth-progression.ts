import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type {
  KothControlPeriod,
  KothProgression,
  KothProgressionEvent,
  ParsedHighlightEvent,
  StateByte2Transition,
} from "../../types";
import { findBestKothCaptureAssignment } from "./koth-capture-search";

const OBJECTIVE_TICK_DEDUP_MS = 2_500;
// A hill capture requires ~40 seconds of scoring meter (HCS King of the Hill settings), and
// ZonesStats counts one StrongholdScoringTick per scoring second. A team's match score can also
// include hills pre-awarded in the lobby (e.g. resuming an abandoned series game) which never
// appear in the film, so a team's in-film captures can never exceed scoringTicks / 40.
const SCORING_TICKS_PER_CAPTURE = 40;
const GAMEPLAY_BYTE2_MIN = 0x40;
const GAMEPLAY_BYTE2_MAX = 0xa0;

function buildTeamCaptureTargets(matchStats: MatchStats): Map<number, number> {
  const targets = new Map<number, number>();
  for (const team of matchStats.Teams) {
    const matchScore = team.Stats.CoreStats.Score;
    const maxInFilmCaptures =
      "ZonesStats" in team.Stats
        ? Math.floor(team.Stats.ZonesStats.StrongholdScoringTicks / SCORING_TICKS_PER_CAPTURE)
        : matchScore;
    targets.set(team.TeamId, Math.min(matchScore, maxInFilmCaptures));
  }
  return targets;
}

function buildKothScoreEvents(
  modeEvents: ParsedHighlightEvent[],
  knownTeamIds: ReadonlySet<number>,
): KothProgressionEvent[] {
  const runningScores = new Map<number, number>([...knownTeamIds].map((id) => [id, 0]));
  const events: KothProgressionEvent[] = [];
  const lastEventTimeByTeam = new Map<number, number>();

  for (const event of modeEvents) {
    if (event.teamId == null || !knownTeamIds.has(event.teamId)) {
      continue;
    }
    const lastTime = lastEventTimeByTeam.get(event.teamId) ?? -Infinity;
    if (event.timeMs - lastTime < OBJECTIVE_TICK_DEDUP_MS) {
      continue;
    }
    lastEventTimeByTeam.set(event.teamId, event.timeMs);
    runningScores.set(event.teamId, Preconditions.checkExists(runningScores.get(event.teamId)) + 1);
    events.push({
      timestampMs: event.timeMs,
      teamId: event.teamId,
      runningScores: Object.fromEntries(runningScores),
    });
  }

  return events;
}

// Raw (undeduped) mode events are intentional here: duplicate film emissions correlate with
// sustained control, and that density is load-bearing evidence for window attribution —
// switching to deduped events flips validated window teams on real matches.
function findControllingTeamInWindow(
  modeEvents: ParsedHighlightEvent[],
  startMs: number,
  endMs: number,
): number | null {
  const teamCounts = new Map<number, number>();
  for (const event of modeEvents) {
    if (event.teamId == null || event.timeMs < startMs || event.timeMs >= endMs) {
      continue;
    }
    teamCounts.set(event.teamId, (teamCounts.get(event.teamId) ?? 0) + 1);
  }
  let controllingTeamId: number | null = null;
  let maxCount = 0;
  for (const [teamId, count] of teamCounts) {
    if (count > maxCount) {
      maxCount = count;
      controllingTeamId = teamId;
    }
  }
  return controllingTeamId;
}

function buildKothControlPeriods(
  byte2Transitions: StateByte2Transition[],
  modeEvents: ParsedHighlightEvent[],
  durationMs: number,
): KothControlPeriod[] {
  // Film-clock interpolation can land a transition past MatchInfo.Duration; such boundaries
  // would produce an inverted final period, so they are clamped out.
  const gameplayTransitions = byte2Transitions.filter(
    (t) => t.toValue >= GAMEPLAY_BYTE2_MIN && t.toValue < GAMEPLAY_BYTE2_MAX && t.timeMs < durationMs,
  );
  if (gameplayTransitions.length === 0) {
    return [];
  }
  const boundaries = [...new Set([0, ...gameplayTransitions.map((t) => t.timeMs), durationMs])].sort((a, b) => a - b);
  const periods: KothControlPeriod[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i] ?? 0;
    const endMs = boundaries[i + 1] ?? durationMs;
    periods.push({ startMs, endMs, controllingTeamId: findControllingTeamInWindow(modeEvents, startMs, endMs) });
  }
  return periods;
}

export function buildKothProgression(
  modeEvents: ParsedHighlightEvent[],
  byte2Transitions: StateByte2Transition[],
  matchStats: MatchStats,
  durationMs: number,
): KothProgression {
  const knownTeamIds = new Set<number>(matchStats.Teams.map((team) => team.TeamId));
  const events = buildKothScoreEvents(modeEvents, knownTeamIds);
  const controlPeriods = buildKothControlPeriods(byte2Transitions, modeEvents, durationMs);
  return {
    events,
    controlPeriods,
    hillCaptureTimestamps: findBestKothCaptureAssignment(events, buildTeamCaptureTargets(matchStats), controlPeriods),
    teamCount: knownTeamIds.size,
  };
}
