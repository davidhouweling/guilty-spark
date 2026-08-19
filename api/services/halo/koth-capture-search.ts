import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ObjectiveControlPeriod, ObjectiveControlProgressionEvent } from "./types";

export const MIN_CAPTURE_TICKS = 5;
// A capture relocates the hill, so no team can score for the travel time afterwards. Ticks arrive
// on a ~5 000 ms cadence while a hill is occupied; the shortest post-capture quiet gap observed in
// real matches is ~11 100 ms, so 8 000 ms separates same-hill ticking from a relocation.
export const RELOCATION_GAP_MS = 8_000;
// A capture needs the meter full: 40 seconds of scoring (HCS King of the Hill settings). Each
// film tick represents ~5 seconds of scoring, and a gap larger than 1.5 cadences between the
// capturer's own ticks can hide one dropped film tick (or paused-meter time), granting one
// extra tick of credit. A perfect-cadence 7-tick run is therefore ~35s — short of a capture.
const TICK_SCORING_MS = 5_000;
const CAPTURE_METER_MS = 40_000;
const HIDDEN_TICK_GAP_MS = 7_500;
const FULL_METER_TICKS = CAPTURE_METER_MS / TICK_SCORING_MS;
const MAX_SEARCH_NODES = 50_000;

interface CaptureStep {
  eventIndex: number;
  perHillTicks: number;
  overtakenTeams: number;
  insufficientMeter: boolean;
  byte2Contradicted: boolean;
  windowMismatched: boolean;
}

interface AssignmentScore {
  capturesPlaced: number;
  violations: number;
  byte2Contradictions: number;
  underTickCost: number;
  variance: number;
  windowMismatches: number;
  totalTicks: number;
  timestampSum: number;
}

function compareAssignmentScores(a: AssignmentScore, b: AssignmentScore): number {
  if (a.capturesPlaced !== b.capturesPlaced) {
    return b.capturesPlaced - a.capturesPlaced;
  }
  if (a.violations !== b.violations) {
    return a.violations - b.violations;
  }
  if (a.byte2Contradictions !== b.byte2Contradictions) {
    return a.byte2Contradictions - b.byte2Contradictions;
  }
  // Captures below a full meter's worth of ticks are only ever explained (dropped film ticks),
  // never preferred: cutting a scoring run short of 8 ticks reads an 80–95% meter as a capture.
  if (a.underTickCost !== b.underTickCost) {
    return a.underTickCost - b.underTickCost;
  }
  if (a.variance !== b.variance) {
    return a.variance - b.variance;
  }
  // Weak byte2 signal: prefer captures sitting inside their own team's control window. Ranked
  // below variance because a genuine capture can land late in an opponent-attributed window.
  if (a.windowMismatches !== b.windowMismatches) {
    return a.windowMismatches - b.windowMismatches;
  }
  if (a.totalTicks !== b.totalTicks) {
    return b.totalTicks - a.totalTicks;
  }
  // Later boundaries attribute ambiguous ticks to the earlier hill — the capture meter only
  // completes once it is genuinely full, so extra same-hill scoring outranks an early split.
  return b.timestampSum - a.timestampSum;
}

function varianceOf(counts: readonly number[]): number {
  if (counts.length === 0) {
    return 0;
  }
  const mean = counts.reduce((acc, count) => acc + count, 0) / counts.length;
  return counts.reduce((acc, count) => acc + (count - mean) ** 2, 0) / counts.length;
}

class KothCaptureSearch {
  private readonly events: readonly ObjectiveControlProgressionEvent[];
  private readonly controlPeriods: readonly ObjectiveControlPeriod[];
  private readonly remainingCaptures: Map<number, number>;
  private readonly steps: CaptureStep[] = [];
  private visitedNodes = 0;
  private best: { timestamps: number[]; score: AssignmentScore } | null = null;

  constructor(
    events: readonly ObjectiveControlProgressionEvent[],
    targetCapturesByTeam: ReadonlyMap<number, number>,
    controlPeriods: readonly ObjectiveControlPeriod[],
  ) {
    this.events = events;
    this.remainingCaptures = new Map(targetCapturesByTeam);
    this.controlPeriods = controlPeriods;
  }

  run(): number[] {
    if (this.events.length === 0) {
      return [];
    }
    this.explore(0, {});
    return this.best?.timestamps ?? [];
  }

  private explore(startIndex: number, hillBaseline: Record<string, number>): void {
    this.recordCandidate(hillBaseline);
    for (let index = startIndex; index < this.events.length; index++) {
      if (this.visitedNodes >= MAX_SEARCH_NODES) {
        return;
      }
      const event = Preconditions.checkExists(this.events[index]);
      const remainingForTeam = this.remainingCaptures.get(event.teamId) ?? 0;
      if (remainingForTeam <= 0) {
        continue;
      }
      const perHillTicks = (event.runningScores[String(event.teamId)] ?? 0) - (hillBaseline[String(event.teamId)] ?? 0);
      if (perHillTicks < MIN_CAPTURE_TICKS) {
        continue;
      }
      if (!this.isFollowedByRelocationGap(index)) {
        continue;
      }

      this.visitedNodes += 1;
      this.steps.push({
        eventIndex: index,
        perHillTicks,
        overtakenTeams: this.countOvertakenTeams(event, hillBaseline, perHillTicks),
        insufficientMeter: this.hasInsufficientMeterTime(startIndex, index),
        byte2Contradicted: this.isContradictedByControlPeriods(event),
        windowMismatched: this.isInAnotherTeamsWindow(event),
      });
      this.remainingCaptures.set(event.teamId, remainingForTeam - 1);
      this.explore(index + 1, event.runningScores);
      this.remainingCaptures.set(event.teamId, remainingForTeam);
      this.steps.pop();
    }
  }

  private isFollowedByRelocationGap(eventIndex: number): boolean {
    const event = Preconditions.checkExists(this.events[eventIndex]);
    const nextEvent = this.events[eventIndex + 1];
    return nextEvent == null || nextEvent.timestampMs - event.timestampMs >= RELOCATION_GAP_MS;
  }

  private countOvertakenTeams(
    event: ObjectiveControlProgressionEvent,
    hillBaseline: Record<string, number>,
    perHillTicks: number,
  ): number {
    let overtaken = 0;
    for (const [teamIdKey, cumulative] of Object.entries(event.runningScores)) {
      if (Number(teamIdKey) === event.teamId) {
        continue;
      }
      const otherTeamTicks = cumulative - (hillBaseline[teamIdKey] ?? 0);
      // Strictly greater: equal tick counts are common dedup jitter, not an implausibility.
      // A full meter's worth of opponent ticks is a violation regardless — that team's meter
      // would have completed first, so this hill cannot still be open for the capturer.
      if (otherTeamTicks > perHillTicks || otherTeamTicks >= FULL_METER_TICKS) {
        overtaken += 1;
      }
    }
    return overtaken;
  }

  private hasInsufficientMeterTime(hillStartIndex: number, captureIndex: number): boolean {
    const captureEvent = Preconditions.checkExists(this.events[captureIndex]);
    let scoringMs = 0;
    let previousOwnTickMs: number | null = null;
    for (let index = hillStartIndex; index <= captureIndex; index++) {
      const event = Preconditions.checkExists(this.events[index]);
      if (event.teamId !== captureEvent.teamId) {
        continue;
      }
      scoringMs += TICK_SCORING_MS;
      if (previousOwnTickMs != null && event.timestampMs - previousOwnTickMs > HIDDEN_TICK_GAP_MS) {
        scoringMs += TICK_SCORING_MS;
      }
      previousOwnTickMs = event.timestampMs;
    }
    return scoringMs < CAPTURE_METER_MS;
  }

  // Control periods attribute each film window to the team with the majority of mode events in
  // it. A capture ends the window (the hill relocates), so if the window's team scores again
  // AFTER the capture tick while still inside the same window, the hill demonstrably did not
  // relocate there — the boundary was read into the middle of that team's run. A capture merely
  // sitting late in an opponent-attributed window is fine (their run ended, then the capturer
  // finished the meter).
  private isContradictedByControlPeriods(event: ObjectiveControlProgressionEvent): boolean {
    const containing = this.findContainingControlPeriod(event);
    if (containing?.controllingTeamId == null || containing.controllingTeamId === event.teamId) {
      return false;
    }
    return this.events.some(
      (other) =>
        other.teamId === containing.controllingTeamId &&
        other.timestampMs > event.timestampMs &&
        other.timestampMs < containing.endMs,
    );
  }

  private isInAnotherTeamsWindow(event: ObjectiveControlProgressionEvent): boolean {
    const containing = this.findContainingControlPeriod(event);
    return containing?.controllingTeamId != null && containing.controllingTeamId !== event.teamId;
  }

  private findContainingControlPeriod(event: ObjectiveControlProgressionEvent): ObjectiveControlPeriod | undefined {
    return this.controlPeriods.find(
      (period) => period.startMs <= event.timestampMs && event.timestampMs < period.endMs,
    );
  }

  private recordCandidate(hillBaseline: Record<string, number>): void {
    const score = this.scoreCurrentAssignment(hillBaseline);
    if (this.best == null || compareAssignmentScores(score, this.best.score) < 0) {
      this.best = {
        timestamps: this.steps.map((step) => Preconditions.checkExists(this.events[step.eventIndex]).timestampMs),
        score,
      };
    }
  }

  private scoreCurrentAssignment(hillBaseline: Record<string, number>): AssignmentScore {
    const perHillCounts = this.steps.map((step) => step.perHillTicks);
    const violations =
      this.steps.reduce((acc, step) => acc + step.overtakenTeams + (step.insufficientMeter ? 1 : 0), 0) +
      this.countTrailingViolations(hillBaseline, perHillCounts);
    return {
      capturesPlaced: perHillCounts.length,
      violations,
      byte2Contradictions: this.steps.reduce((acc, step) => acc + (step.byte2Contradicted ? 1 : 0), 0),
      underTickCost: perHillCounts.reduce((acc, count) => acc + Math.max(0, FULL_METER_TICKS - count), 0),
      variance: varianceOf(perHillCounts),
      windowMismatches: this.steps.reduce((acc, step) => acc + (step.windowMismatched ? 1 : 0), 0),
      totalTicks: perHillCounts.reduce((acc, count) => acc + count, 0),
      timestampSum: this.steps.reduce(
        (acc, step) => acc + Preconditions.checkExists(this.events[step.eventIndex]).timestampMs,
        0,
      ),
    };
  }

  private countTrailingViolations(hillBaseline: Record<string, number>, perHillCounts: readonly number[]): number {
    if (perHillCounts.length === 0) {
      return 0;
    }
    const smallestCaptureCount = Math.min(...perHillCounts);
    const matchEndEvent = Preconditions.checkExists(this.events.at(-1));
    let violations = 0;
    for (const [teamIdKey, cumulative] of Object.entries(matchEndEvent.runningScores)) {
      if (cumulative - (hillBaseline[teamIdKey] ?? 0) >= smallestCaptureCount) {
        violations += 1;
      }
    }
    return violations;
  }
}

/**
 * Finds the most plausible ordered set of hill-capture events given each team's known capture
 * count (match score, minus any hills pre-awarded in the lobby). A capture candidate is a score
 * tick whose per-hill tick count has reached MIN_CAPTURE_TICKS and that is followed by a
 * relocation-sized quiet gap. Among assignments that place the most captures, prefers fewest
 * physical implausibilities (another team holding more per-hill ticks than the capturer, or a
 * trailing uncaptured hill with capture-worthy ticks), then fewest byte2 control-period
 * contradictions, then the most uniform per-capture tick counts (the capture meter fills at a
 * fixed rate).
 */
export function findBestKothCaptureAssignment(
  events: readonly ObjectiveControlProgressionEvent[],
  targetCapturesByTeam: ReadonlyMap<number, number>,
  controlPeriods: readonly ObjectiveControlPeriod[],
): number[] {
  return new KothCaptureSearch(events, targetCapturesByTeam, controlPeriods).run();
}
