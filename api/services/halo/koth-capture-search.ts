import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ObjectiveControlProgressionEvent } from "./types";

export const MIN_CAPTURE_TICKS = 5;
// A capture relocates the hill, so no team can score for the travel time afterwards. Ticks arrive
// on a ~5 000 ms cadence while a hill is occupied; the shortest post-capture quiet gap observed in
// real matches is ~11 100 ms, so 8 000 ms separates same-hill ticking from a relocation.
export const RELOCATION_GAP_MS = 8_000;
const MAX_SEARCH_NODES = 50_000;

interface CaptureStep {
  eventIndex: number;
  perHillTicks: number;
  overtakenTeams: number;
}

interface AssignmentScore {
  capturesPlaced: number;
  violations: number;
  variance: number;
  totalTicks: number;
}

function compareAssignmentScores(a: AssignmentScore, b: AssignmentScore): number {
  if (a.capturesPlaced !== b.capturesPlaced) {
    return b.capturesPlaced - a.capturesPlaced;
  }
  if (a.violations !== b.violations) {
    return a.violations - b.violations;
  }
  if (a.variance !== b.variance) {
    return a.variance - b.variance;
  }
  return b.totalTicks - a.totalTicks;
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
  private readonly remainingCaptures: Map<number, number>;
  private readonly steps: CaptureStep[] = [];
  private visitedNodes = 0;
  private best: { timestamps: number[]; score: AssignmentScore } | null = null;

  constructor(
    events: readonly ObjectiveControlProgressionEvent[],
    targetCapturesByTeam: ReadonlyMap<number, number>,
  ) {
    this.events = events;
    this.remainingCaptures = new Map(targetCapturesByTeam);
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
      const perHillTicks =
        (event.runningScores[String(event.teamId)] ?? 0) - (hillBaseline[String(event.teamId)] ?? 0);
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
      if (cumulative - (hillBaseline[teamIdKey] ?? 0) >= perHillTicks) {
        overtaken += 1;
      }
    }
    return overtaken;
  }

  private recordCandidate(hillBaseline: Record<string, number>): void {
    const score = this.scoreCurrentAssignment(hillBaseline);
    if (this.best == null || compareAssignmentScores(score, this.best.score) < 0) {
      this.best = {
        timestamps: this.steps.map(
          (step) => Preconditions.checkExists(this.events[step.eventIndex]).timestampMs,
        ),
        score,
      };
    }
  }

  private scoreCurrentAssignment(hillBaseline: Record<string, number>): AssignmentScore {
    const perHillCounts = this.steps.map((step) => step.perHillTicks);
    const violations =
      this.steps.reduce((acc, step) => acc + step.overtakenTeams, 0) +
      this.countTrailingViolations(hillBaseline, perHillCounts);
    return {
      capturesPlaced: perHillCounts.length,
      violations,
      variance: varianceOf(perHillCounts),
      totalTicks: perHillCounts.reduce((acc, count) => acc + count, 0),
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
 * count (match score). A capture candidate is a score tick whose per-hill tick count has reached
 * MIN_CAPTURE_TICKS and that is followed by a relocation-sized quiet gap. Among assignments that
 * place the most captures, prefers fewest physical implausibilities (another team holding more
 * per-hill ticks than the capturer, or a trailing uncaptured hill with capture-worthy ticks),
 * then the most uniform per-capture tick counts (the capture meter fills at a fixed rate).
 */
export function findBestKothCaptureAssignment(
  events: readonly ObjectiveControlProgressionEvent[],
  targetCapturesByTeam: ReadonlyMap<number, number>,
): number[] {
  return new KothCaptureSearch(events, targetCapturesByTeam).run();
}
