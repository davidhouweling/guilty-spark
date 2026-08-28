import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ParsedHighlightEvent } from "../../types";

// HCS Oddball: the ball carrier scores 1 point per full in-game second held; a round is won at
// CAP_SCORE points, or by the leader when the 5-minute round timer expires. The round timer
// PAUSES while the ball is held, so a timed-out round's wall duration is the 5 minutes of
// unheld time plus every held second — which lets the total held seconds of a timed-out round
// be recovered from its wall duration alone.
const CAP_SCORE = 100;
const ROUND_TIMER_MS = 300_000;
// Wall time between a round ending and the next round's timer running (scoreboard + countdown).
const ROUND_BREAK_MS = 12_000;
// Wall time from match start until round 1's timer runs (longer: match intro).
const FIRST_ROUND_INTRO_MS = 11_000;
// A round break shows as total silence (no kills, deaths or carry events) for at least this long.
const ROUND_BREAK_GAP_MS = 15_000;
const MIN_ROUND_DURATION_MS = 120_000;
const MAX_BREAK_CANDIDATES = 12;
// The film emits a carry event at every ~5s crossing of a team's carry clock (which persists
// across drops within a round), plus an event on many pickups. A same-team gap inside this
// window is a clock crossing worth ~5 ticks; anything else is a touch worth ~1 tick.
const CROSSING_TICKS = 5;
const CROSSING_GAP_MIN_MS = 4000;
const CROSSING_GAP_MAX_MS = 7500;
// Short runs the crossing window misses average ~2.5 ticks (theatre-calibrated).
const TOUCH_TICKS = 2.5;
// Every ball pickup loses the sub-second remainder of a held second and quick pickups are
// mostly invisible to the film, so held seconds convert to scored ticks at a roughly fixed
// rate (calibrated against theatre-verified rounds: 108/139 and 145/167).
const HELD_TO_TICKS_RATIO = 0.85;
// A capped round ends while the winner is riding the meter to 100: their last carry event sits
// at the round's final activity AND is a clock crossing (a buzzer-scramble touch at the end of
// a timed-out round is near the final activity too, but is a touch, not a crossing).
const CAP_END_PROXIMITY_MS = 6_000;

export interface OddballScorePoint {
  timestampMs: number;
  teamId: number;
  runningScores: Record<string, number>;
}

export interface OddballRound {
  roundIndex: number;
  startMs: number;
  endMs: number;
  endedByCap: boolean;
  winnerTeamId: number | null;
  scores: Record<string, number>;
  points: OddballScorePoint[];
}

export interface OddballProgression {
  rounds: OddballRound[];
  teamCount: number;
}

interface CarryEvent {
  timestampMs: number;
  teamId: number;
}

interface RoundWindow {
  startMs: number;
  endMs: number;
}

interface EstimatedEvent {
  timestampMs: number;
  teamId: number;
  weight: number;
  isTouch: boolean;
}

interface SolvedRound {
  scores: Map<number, number>;
  winnerTeamId: number | null;
  endedByCap: boolean;
}

function enumerateCombinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }
  const results: T[][] = [];
  for (let i = 0; i <= items.length - size; i++) {
    const head = Preconditions.checkExists(items[i]);
    for (const rest of enumerateCombinations(items.slice(i + 1), size - 1)) {
      results.push([head, ...rest]);
    }
  }
  return results;
}

// Prefer the largest silences, but every resulting round must be plausibly long — early-game
// lulls and mid-round stand-offs also produce silences.
function chooseRoundBreaks(
  gaps: readonly { startMs: number; endMs: number }[],
  neededBreaks: number,
  durationMs: number,
): { startMs: number; endMs: number }[] {
  if (neededBreaks <= 0) {
    return [];
  }
  // bound the enumeration: breaks are always among the largest silences
  const bySize = [...gaps].sort((a, b) => b.endMs - b.startMs - (a.endMs - a.startMs)).slice(0, MAX_BREAK_CANDIDATES);
  const combos = enumerateCombinations(bySize, neededBreaks);
  for (const combo of combos) {
    const ordered = [...combo].sort((a, b) => a.startMs - b.startMs);
    const bounds = [0, ...ordered.flatMap((g) => [g.startMs, g.endMs]), durationMs];
    let valid = true;
    for (let i = 0; i < bounds.length; i += 2) {
      const start = Preconditions.checkExists(bounds[i]);
      const end = Preconditions.checkExists(bounds[i + 1]);
      if (end - start < MIN_ROUND_DURATION_MS) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return ordered;
    }
  }
  return [...gaps].slice(0, neededBreaks).sort((a, b) => a.startMs - b.startMs);
}

function collectActivityGaps(
  activityTimes: readonly number[],
  thresholdMs: number,
): { startMs: number; endMs: number }[] {
  const gaps: { startMs: number; endMs: number }[] = [];
  for (let i = 1; i < activityTimes.length; i++) {
    const prev = Preconditions.checkExists(activityTimes[i - 1]);
    const curr = Preconditions.checkExists(activityTimes[i]);
    if (curr - prev >= thresholdMs) {
      gaps.push({ startMs: prev, endMs: curr });
    }
  }
  return gaps;
}

function findRoundWindows(activityTimes: readonly number[], roundCount: number, durationMs: number): RoundWindow[] {
  const neededBreaks = roundCount - 1;
  // a very quiet break can fall just short of the usual threshold; relax before giving up
  let chosen: { startMs: number; endMs: number }[] = [];
  for (const thresholdMs of [ROUND_BREAK_GAP_MS, 12_000, 10_000]) {
    chosen = chooseRoundBreaks(collectActivityGaps(activityTimes, thresholdMs), neededBreaks, durationMs);
    if (chosen.length === neededBreaks) {
      break;
    }
  }

  const windows: RoundWindow[] = [];
  let cursor = 0;
  for (const gap of chosen) {
    windows.push({ startMs: cursor, endMs: gap.startMs });
    cursor = gap.endMs;
  }
  windows.push({ startMs: cursor, endMs: durationMs });
  return windows;
}

function classifyEvents(carryEvents: readonly CarryEvent[], windows: readonly RoundWindow[]): EstimatedEvent[] {
  const estimated: EstimatedEvent[] = [];
  for (const window of windows) {
    const inRound = carryEvents.filter((e) => window.startMs <= e.timestampMs && e.timestampMs <= window.endMs);
    const previousByTeam = new Map<number, number>();
    for (const event of inRound) {
      const previous = previousByTeam.get(event.teamId);
      const gap = previous == null ? Number.POSITIVE_INFINITY : event.timestampMs - previous;
      const isCrossing = gap >= CROSSING_GAP_MIN_MS && gap <= CROSSING_GAP_MAX_MS;
      estimated.push({
        timestampMs: event.timestampMs,
        teamId: event.teamId,
        weight: isCrossing ? CROSSING_TICKS : TOUCH_TICKS,
        isTouch: !isCrossing,
      });
      previousByTeam.set(event.teamId, event.timestampMs);
    }
  }
  return estimated;
}

// The round timer starts a fixed break after the previous round's last activity (r=0: after
// the match intro) — the first activity of a round can lag the timer by a ball-walk delay.
function timerStartMs(roundIndex: number, windows: readonly RoundWindow[]): number {
  if (roundIndex === 0) {
    return FIRST_ROUND_INTRO_MS;
  }
  const previous = Preconditions.checkExists(windows[roundIndex - 1]);
  return previous.endMs + ROUND_BREAK_MS;
}

// held seconds recoverable from the wall duration of a timed-out round (see header comment)
function timedOutHeldMs(roundIndex: number, windows: readonly RoundWindow[]): number {
  const window = Preconditions.checkExists(windows[roundIndex]);
  return window.endMs - timerStartMs(roundIndex, windows) - ROUND_TIMER_MS;
}

// Nudge non-cap-winner scores proportionally so each team's round scores sum to the API total,
// then round to integers preserving the sums exactly.
function reconcileToMatchTotals(
  solved: SolvedRound[],
  teamIds: readonly number[],
  matchTotals: ReadonlyMap<number, number>,
): void {
  for (const teamId of teamIds) {
    const target = matchTotals.get(teamId) ?? 0;
    const fixed = solved.reduce(
      (acc, round) => acc + (round.endedByCap && round.winnerTeamId === teamId ? CAP_SCORE : 0),
      0,
    );
    const adjustable = solved.filter((round) => !(round.endedByCap && round.winnerTeamId === teamId));
    const currentSum = adjustable.reduce((acc, round) => acc + (round.scores.get(teamId) ?? 0), 0);
    const remaining = Math.max(target - fixed, 0);
    const scale = currentSum > 0 ? remaining / currentSum : 0;
    // integer rounding that preserves the team total: the last adjustable round absorbs the remainder
    let allocated = fixed;
    for (const [index, round] of adjustable.entries()) {
      const scaled = (round.scores.get(teamId) ?? 0) * scale;
      const value = index === adjustable.length - 1 ? target - allocated : Math.round(scaled);
      round.scores.set(teamId, Math.max(value, 0));
      allocated += Math.max(value, 0);
    }
  }
}

function buildRoundPoints(
  window: RoundWindow,
  estimated: readonly EstimatedEvent[],
  teamIds: readonly number[],
  solvedScores: ReadonlyMap<number, number>,
): OddballScorePoint[] {
  const inRound = estimated.filter((e) => window.startMs <= e.timestampMs && e.timestampMs <= window.endMs);
  const rawTotals = new Map<number, number>(teamIds.map((id) => [id, 0]));
  for (const event of inRound) {
    rawTotals.set(event.teamId, (rawTotals.get(event.teamId) ?? 0) + event.weight);
  }
  const scales = new Map<number, number>(
    teamIds.map((id) => {
      const raw = rawTotals.get(id) ?? 0;
      return [id, raw > 0 ? (solvedScores.get(id) ?? 0) / raw : 0];
    }),
  );

  const running = new Map<number, number>(teamIds.map((id) => [id, 0]));
  const points: OddballScorePoint[] = [];
  for (const event of inRound) {
    const scaled = (running.get(event.teamId) ?? 0) + event.weight * (scales.get(event.teamId) ?? 0);
    running.set(event.teamId, scaled);
    points.push({
      timestampMs: event.timestampMs,
      teamId: event.teamId,
      runningScores: Object.fromEntries(
        [...running.entries()].map(([teamId, value]) => [String(teamId), Math.round(value)]),
      ),
    });
  }
  return points;
}

// Nobody can exceed the cap in any round (and only a capped round's winner reaches it exactly);
// excess moves to the team's other rounds so per-team match totals stay intact.
function clampScoresToCap(solved: SolvedRound[], teamIds: readonly number[]): void {
  for (const teamId of teamIds) {
    const limitFor = (round: SolvedRound): number =>
      round.endedByCap && round.winnerTeamId === teamId ? CAP_SCORE : CAP_SCORE - 1;
    let excess = 0;
    for (const round of solved) {
      const over = (round.scores.get(teamId) ?? 0) - limitFor(round);
      if (over > 0) {
        round.scores.set(teamId, limitFor(round));
        excess += over;
      }
    }
    // refill into headroom, never past any round's own limit
    const byHeadroom = [...solved].sort(
      (a, b) => limitFor(b) - (b.scores.get(teamId) ?? 0) - (limitFor(a) - (a.scores.get(teamId) ?? 0)),
    );
    for (const round of byHeadroom) {
      if (excess <= 0) {
        break;
      }
      const headroom = limitFor(round) - (round.scores.get(teamId) ?? 0);
      const add = Math.min(headroom, excess);
      if (add > 0) {
        round.scores.set(teamId, (round.scores.get(teamId) ?? 0) + add);
        excess -= add;
      }
    }
  }
}

function enumerateWinnerAssignments(
  solved: readonly SolvedRound[],
  teamIds: readonly number[],
  roundsWonByTeam: ReadonlyMap<number, number>,
): number[][] {
  const build = (index: number, remaining: Map<number, number>): number[][] => {
    if (index === solved.length) {
      return [...remaining.values()].every((count) => count === 0) ? [[]] : [];
    }
    const round = Preconditions.checkExists(solved[index]);
    const candidates = round.endedByCap && round.winnerTeamId != null ? [round.winnerTeamId] : teamIds;
    const results: number[][] = [];
    for (const teamId of candidates) {
      if ((remaining.get(teamId) ?? 0) <= 0) {
        continue;
      }
      remaining.set(teamId, (remaining.get(teamId) ?? 0) - 1);
      for (const rest of build(index + 1, remaining)) {
        results.push([teamId, ...rest]);
      }
      remaining.set(teamId, (remaining.get(teamId) ?? 0) + 1);
    }
    return results;
  };
  return build(0, new Map(roundsWonByTeam));
}

function enforceWinnerMargins(solved: SolvedRound[], teamIds: readonly number[]): void {
  for (const round of solved) {
    const winner = round.winnerTeamId;
    if (winner == null) {
      continue;
    }
    const runnerUp = Math.max(...teamIds.filter((id) => id !== winner).map((id) => round.scores.get(id) ?? 0));
    const shortfall = runnerUp + 1 - (round.scores.get(winner) ?? 0);
    if (shortfall <= 0) {
      continue;
    }
    // pull the shortfall from the winner's score in the sibling round with the most headroom
    const [donor] = solved
      .filter((other) => other !== round && !(other.endedByCap && other.winnerTeamId === winner))
      .sort((a, b) => (b.scores.get(winner) ?? 0) - (a.scores.get(winner) ?? 0));
    if (donor == null) {
      continue;
    }
    const donorScore = donor.scores.get(winner) ?? 0;
    const donorFloor =
      donor.winnerTeamId === winner
        ? Math.max(...teamIds.filter((id) => id !== winner).map((id) => donor.scores.get(id) ?? 0)) + 1
        : 0;
    const winnerLimit = round.endedByCap ? CAP_SCORE : CAP_SCORE - 1;
    const headroom = winnerLimit - (round.scores.get(winner) ?? 0);
    const transferable = Math.min(shortfall, Math.max(donorScore - donorFloor, 0), Math.max(headroom, 0));
    round.scores.set(winner, (round.scores.get(winner) ?? 0) + transferable);
    donor.scores.set(winner, donorScore - transferable);
  }
}

// The API records how many rounds each team won; the per-round winner assignment must respect
// those counts (and capped rounds are won by the team that capped). Among valid assignments,
// pick the one that best agrees with the solved score margins, then nudge scores so every
// winner actually leads their round — moving points between a team's own rounds so per-team
// match totals stay intact.
function assignWinnersFromRoundsWon(
  solved: SolvedRound[],
  teamIds: readonly number[],
  roundsWonByTeam: ReadonlyMap<number, number>,
): void {
  const assignments = enumerateWinnerAssignments(solved, teamIds, roundsWonByTeam);
  if (assignments.length === 0) {
    return;
  }
  const margin = (round: SolvedRound, winner: number): number => {
    const winnerScore = round.scores.get(winner) ?? 0;
    const best = Math.max(...teamIds.filter((id) => id !== winner).map((id) => round.scores.get(id) ?? 0));
    return winnerScore - best;
  };
  const best = Preconditions.checkExists(
    [...assignments].sort(
      (a, b) =>
        b.reduce((acc, winner, i) => acc + margin(Preconditions.checkExists(solved[i]), winner), 0) -
        a.reduce((acc, winner, i) => acc + margin(Preconditions.checkExists(solved[i]), winner), 0),
    )[0],
  );
  for (const [index, winner] of best.entries()) {
    Preconditions.checkExists(solved[index]).winnerTeamId = winner;
  }
  enforceWinnerMargins(solved, teamIds);
}

function solveRoundScores(
  windows: readonly RoundWindow[],
  estimated: readonly EstimatedEvent[],
  teamIds: readonly number[],
  matchTotals: ReadonlyMap<number, number>,
  roundsWonByTeam: ReadonlyMap<number, number>,
): SolvedRound[] {
  const lastCarryByRound = windows.map((window) => {
    const last = new Map<number, EstimatedEvent>();
    for (const event of estimated) {
      if (window.startMs <= event.timestampMs && event.timestampMs <= window.endMs) {
        last.set(event.teamId, event);
      }
    }
    return last;
  });

  // raw estimator sums per round per team
  const raw = windows.map((window) => {
    const sums = new Map<number, number>(teamIds.map((id) => [id, 0]));
    for (const event of estimated) {
      if (window.startMs <= event.timestampMs && event.timestampMs <= window.endMs) {
        sums.set(event.teamId, (sums.get(event.teamId) ?? 0) + event.weight);
      }
    }
    return { sums };
  });

  // classify cap vs timed-out: a timed-out round's wall duration implies its held seconds; a
  // capped round ends early, making that implied value inconsistent (usually far below the
  // estimator's held time, or negative).
  const solved: SolvedRound[] = windows.map((_window, roundIndex) => {
    const { sums } = Preconditions.checkExists(raw[roundIndex]);
    const window = Preconditions.checkExists(windows[roundIndex]);
    const impliedHeldMs = timedOutHeldMs(roundIndex, windows);
    const impliedTicks = Math.round((impliedHeldMs * HELD_TO_TICKS_RATIO) / 1000);

    const leaderTeamId = [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const leaderLast = Preconditions.checkExists(lastCarryByRound[roundIndex]).get(leaderTeamId ?? -1);
    const endedByCap =
      leaderLast != null && window.endMs - leaderLast.timestampMs <= CAP_END_PROXIMITY_MS && !leaderLast.isTouch;
    const scores = new Map<number, number>();
    if (endedByCap && leaderTeamId != null) {
      // winner capped at exactly CAP_SCORE; scale the rest by the estimator's ratio to the winner
      const winnerRaw = sums.get(leaderTeamId) ?? 1;
      for (const teamId of teamIds) {
        const value = teamId === leaderTeamId ? CAP_SCORE : ((sums.get(teamId) ?? 0) / winnerRaw) * CAP_SCORE;
        scores.set(teamId, value);
      }
    } else {
      // timed-out: both teams' ticks sum to the implied total; split by estimator ratio
      const total = Math.max(impliedTicks, 1);
      const rawTotal = Math.max(
        [...sums.values()].reduce((a, b) => a + b, 0),
        1,
      );
      for (const teamId of teamIds) {
        scores.set(teamId, ((sums.get(teamId) ?? 0) / rawTotal) * total);
      }
    }
    return { scores, winnerTeamId: leaderTeamId, endedByCap };
  });

  reconcileToMatchTotals(solved, teamIds, matchTotals);
  // A timed-out round can never reach the cap — any round solving at or above it must have
  // been capped (the film can miss the winner's final crossing). Reclassify and re-solve.
  for (const _pass of windows) {
    void _pass;
    const [round] = solved
      .filter((candidate) => !candidate.endedByCap && Math.max(...candidate.scores.values()) >= CAP_SCORE)
      .sort((a, b) => Math.max(...b.scores.values()) - Math.max(...a.scores.values()));
    if (round == null) {
      break;
    }
    round.endedByCap = true;
    const leader = [...round.scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    round.winnerTeamId = leader;
    if (leader != null) {
      const leaderRaw = round.scores.get(leader) ?? 1;
      for (const teamId of teamIds) {
        const value = teamId === leader ? CAP_SCORE : ((round.scores.get(teamId) ?? 0) / leaderRaw) * CAP_SCORE;
        round.scores.set(teamId, value);
      }
    }
    reconcileToMatchTotals(solved, teamIds, matchTotals);
  }
  clampScoresToCap(solved, teamIds);
  assignWinnersFromRoundsWon(solved, teamIds, roundsWonByTeam);
  return solved;
}

export function buildOddballProgression(
  events: readonly ParsedHighlightEvent[],
  matchStats: MatchStats,
  durationMs: number,
): OddballProgression {
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const matchTotals = new Map(matchStats.Teams.map((team) => [team.TeamId, team.Stats.CoreStats.Score]));
  const roundCount = matchStats.Teams.reduce((acc, team) => acc + team.Stats.CoreStats.RoundsWon, 0);
  if (roundCount === 0 || teamIds.length === 0) {
    return { rounds: [], teamCount: teamIds.length };
  }

  // team attribution is not needed to prove the round is live — an unattributed kill still
  // breaks a silence, and requiring it could fabricate round-break gaps
  const activityTimes = events
    .filter((e) => e.eventType === "kill" || e.eventType === "death" || e.eventType === "mode")
    .map((e) => e.timeMs)
    .sort((a, b) => a - b);
  const carryEvents: CarryEvent[] = events
    .filter((e) => e.eventType === "mode" && e.teamId != null)
    .map((e) => ({ timestampMs: e.timeMs, teamId: Preconditions.checkExists(e.teamId) }))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const windows = findRoundWindows(activityTimes, roundCount, durationMs);
  const estimated = classifyEvents(carryEvents, windows);

  const roundsWonByTeam = new Map(matchStats.Teams.map((team) => [team.TeamId, team.Stats.CoreStats.RoundsWon]));
  const roundScores = solveRoundScores(windows, estimated, teamIds, matchTotals, roundsWonByTeam);

  const rounds: OddballRound[] = windows.map((window, roundIndex) => {
    const solved = Preconditions.checkExists(roundScores[roundIndex]);
    const points = buildRoundPoints(window, estimated, teamIds, solved.scores);
    return {
      roundIndex,
      startMs: window.startMs,
      endMs: window.endMs,
      endedByCap: solved.endedByCap,
      winnerTeamId: solved.winnerTeamId,
      scores: Object.fromEntries([...solved.scores.entries()].map(([teamId, score]) => [String(teamId), score])),
      points,
    };
  });

  return { rounds, teamCount: teamIds.length };
}
