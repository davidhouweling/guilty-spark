import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ParsedHighlightEvent } from "../../types";

// HCS Strongholds: three zones; a team scores 1 point/second while holding 2 zones and
// 2 points/second while holding all 3, but a zone only counts while no enemy stands in it.
// The API records per team: CoreStats.Score = POINTS, ZonesStats.StrongholdScoringTicks =
// scoring SECONDS (so Score − ticks = seconds spent at the triple-zone double rate), plus
// StrongholdCaptures and StrongholdSecures. The film emits one mode event per player credited
// on each capture (zone flip) and each secure (an enemy attempt on your zone cleared) — but
// no zone identity and no capture/secure flag. A secure credits exactly one player, so any
// multi-credit event group is certainly a capture; the solver enumerates which single-credit
// groups are the secures, keeps zone-count-legal assignments, and picks the labeling whose
// integrated points/ticks/triple-seconds best match the API totals. When the space overflows
// MAX_CANDIDATES the best of the (deterministic) explored slice is kept.
const ATTEMPT_WINDOW_MS = 6_500;
const TRIPLE_SECONDS_WEIGHT = 2;
const MAX_CANDIDATES = 150_000;
// bounds DFS work including dead-end traversal (mirrors koth-capture-search's node cap);
// ~250k visits ≈ 0.1s on Workers hardware, and the calibration match needs ~137k
const MAX_SEARCH_NODES = 250_000;
const ZONE_COUNT = 3;
// Ranked Strongholds spawns each team owning its home zone with the middle zone neutral —
// observed on every theatre-verified film.
const NEUTRAL_ZONE_COUNT = 1;
// Players credited on the same capture usually share a byte-identical film timestamp; the
// tolerance absorbs sub-second replication jitter without merging distinct events (the
// closest distinct same-team groups observed sit several seconds apart).
const GROUP_TOLERANCE_MS = 1_000;

export interface StrongholdsScorePoint {
  timestampMs: number;
  runningScores: Record<string, number>;
}

export interface StrongholdsProgression {
  events: StrongholdsScorePoint[];
  teamCount: number;
}

type TeamSlot = 0 | 1;

interface EventGroup {
  timestampMs: number;
  teamSlot: TeamSlot;
  credits: number;
}

interface TeamTargets {
  captures: number;
  secures: number;
  points: number;
  ticks: number;
}

interface TeamQuota {
  captures: number;
  secures: number;
}

type Label = "capture" | "secure";

// end-of-window decrements sort before the flip, which sorts before start-of-window increments
const BOUNDARY_ORDER = { windowEnd: 0, flip: 1, windowStart: 2 } as const;

interface SkeletonBoundary {
  timestampMs: number;
  kind: keyof typeof BOUNDARY_ORDER;
  groupIndex: number;
}

interface SweepTotals {
  points: [number, number];
  ticks: [number, number];
  tripleSeconds: [number, number];
}

interface CurveSample {
  timestampMs: number;
  points: [number, number];
}

// Grouping is per team so an opposing event interleaved at the same timestamp cannot split one
// capture's credits into separate groups.
function groupCarryEvents(events: readonly ParsedHighlightEvent[], teamIds: readonly number[]): EventGroup[] {
  const slotByTeamId = new Map<number, TeamSlot>(teamIds.map((id, slot) => [id, slot === 0 ? 0 : 1]));
  const carryEvents = events
    .filter((event) => event.eventType === "mode" && event.teamId != null && slotByTeamId.has(event.teamId))
    .sort((a, b) => a.timeMs - b.timeMs);
  const groups: EventGroup[] = [];
  const lastByTeam: [EventGroup | null, EventGroup | null] = [null, null];
  for (const event of carryEvents) {
    const teamSlot = Preconditions.checkExists(slotByTeamId.get(Preconditions.checkExists(event.teamId)));
    const current = lastByTeam[teamSlot];
    if (current != null && event.timeMs - current.timestampMs <= GROUP_TOLERANCE_MS) {
      current.credits += 1;
      continue;
    }
    const group: EventGroup = { timestampMs: event.timeMs, teamSlot, credits: 1 };
    groups.push(group);
    lastByTeam[teamSlot] = group;
  }
  return groups.sort((a, b) => a.timestampMs - b.timestampMs || a.teamSlot - b.teamSlot);
}

// Quotas come from the API; when the film misses events (or credits drift) the group count can
// disagree — every group still gets a label, and secures never exceed the single-credit groups
// they can occupy (a secure credits exactly one player, so secures <= singles <= group count).
function resolveQuotas(groups: readonly EventGroup[], targets: readonly TeamTargets[]): TeamQuota[] {
  return targets.map((target, teamSlot) => {
    const teamGroups = groups.filter((g) => g.teamSlot === teamSlot);
    const singles = teamGroups.filter((g) => g.credits === 1).length;
    const secures = Math.min(target.secures, singles);
    return { captures: teamGroups.length - secures, secures };
  });
}

// Boundary times never depend on the labeling (only which team a window attacks does), so the
// skeleton is built and sorted once per match rather than per candidate.
function buildSkeleton(groups: readonly EventGroup[]): SkeletonBoundary[] {
  const boundaries: SkeletonBoundary[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    boundaries.push({
      timestampMs: Math.max(0, group.timestampMs - ATTEMPT_WINDOW_MS),
      kind: "windowStart",
      groupIndex,
    });
    boundaries.push({ timestampMs: group.timestampMs, kind: "windowEnd", groupIndex });
    boundaries.push({ timestampMs: group.timestampMs, kind: "flip", groupIndex });
  }
  return boundaries.sort((a, b) => a.timestampMs - b.timestampMs || BOUNDARY_ORDER[a.kind] - BOUNDARY_ORDER[b.kind]);
}

function enemyOf(teamSlot: TeamSlot): TeamSlot {
  return teamSlot === 0 ? 1 : 0;
}

interface ZoneState {
  owned: [number, number];
  neutral: number;
}

function isCaptureLegal(state: ZoneState, capturer: TeamSlot): boolean {
  return state.owned[capturer] < ZONE_COUNT && (state.neutral > 0 || state.owned[enemyOf(capturer)] > 0);
}

// A capture takes the neutral zone while one remains, otherwise an enemy zone; returns what was
// taken so the DFS can undo it.
function applyCapture(state: ZoneState, capturer: TeamSlot): "neutral" | "enemy" | "none" {
  let taken: "neutral" | "enemy" | "none" = "none";
  if (state.neutral > 0) {
    state.neutral -= 1;
    taken = "neutral";
  } else if (state.owned[enemyOf(capturer)] > 0) {
    state.owned[enemyOf(capturer)] -= 1;
    taken = "enemy";
  }
  state.owned[capturer] = Math.min(state.owned[capturer] + 1, ZONE_COUNT);
  return taken;
}

function undoCapture(state: ZoneState, capturer: TeamSlot, taken: "neutral" | "enemy" | "none"): void {
  state.owned[capturer] -= 1;
  if (taken === "neutral") {
    state.neutral += 1;
  } else if (taken === "enemy") {
    state.owned[enemyOf(capturer)] += 1;
  }
}

function scoreRatePerSecond(effectiveZones: number): number {
  if (effectiveZones >= ZONE_COUNT) {
    return 2;
  }
  return effectiveZones === 2 ? 1 : 0;
}

// Sweeps the piecewise-constant rate function over the match. The first capture takes the
// neutral middle zone, so its attempt window contests nobody's owned zone; every later capture
// contests an enemy zone and every secure marks a cleared enemy attempt on the securing team's
// own zone.
function sweep(
  groups: readonly EventGroup[],
  skeleton: readonly SkeletonBoundary[],
  labels: readonly Label[],
  durationMs: number,
  onSample?: (sample: CurveSample) => void,
): SweepTotals {
  // one flat pass resolves which team each group's attempt window attacks (null = the first
  // capture, which takes the neutral zone and contests nobody)
  const attackedSlots: (TeamSlot | null)[] = new Array<TeamSlot | null>(groups.length);
  let firstCaptureSeen = false;
  for (const [index, group] of groups.entries()) {
    if (labels[index] === "secure") {
      attackedSlots[index] = group.teamSlot;
    } else if (firstCaptureSeen) {
      attackedSlots[index] = enemyOf(group.teamSlot);
    } else {
      firstCaptureSeen = true;
      attackedSlots[index] = null;
    }
  }

  const zones: ZoneState = { owned: [1, 1], neutral: NEUTRAL_ZONE_COUNT };
  const attacks: [number, number] = [0, 0];
  const totals: SweepTotals = { points: [0, 0], ticks: [0, 0], tripleSeconds: [0, 0] };

  let cursorMs = 0;
  const advanceTo = (timestampMs: number): void => {
    const clamped = Math.min(timestampMs, durationMs);
    if (clamped <= cursorMs) {
      return;
    }
    const seconds = (clamped - cursorMs) / 1000;
    for (const teamSlot of [0, 1] as const) {
      const effective = Math.max(zones.owned[teamSlot] - attacks[teamSlot], 0);
      const rate = scoreRatePerSecond(effective);
      totals.points[teamSlot] += rate * seconds;
      if (rate > 0) {
        totals.ticks[teamSlot] += seconds;
      }
      if (effective >= ZONE_COUNT) {
        totals.tripleSeconds[teamSlot] += seconds;
      }
    }
    cursorMs = clamped;
    onSample?.({ timestampMs: cursorMs, points: [totals.points[0], totals.points[1]] });
  };

  for (const boundary of skeleton) {
    if (boundary.kind === "flip") {
      if (labels[boundary.groupIndex] !== "capture") {
        continue;
      }
      advanceTo(boundary.timestampMs);
      applyCapture(zones, Preconditions.checkExists(groups[boundary.groupIndex]).teamSlot);
      continue;
    }
    const attackedSlot = attackedSlots[boundary.groupIndex];
    if (attackedSlot == null) {
      continue;
    }
    advanceTo(boundary.timestampMs);
    attacks[attackedSlot] += boundary.kind === "windowStart" ? 1 : -1;
  }
  advanceTo(durationMs);

  return totals;
}

function deviationFromTargets(totals: SweepTotals, targets: readonly TeamTargets[]): number {
  let deviation = 0;
  for (const [teamSlot, target] of targets.entries()) {
    const tripleTarget = Math.max(target.points - target.ticks, 0);
    deviation += Math.abs((totals.points[teamSlot] ?? 0) - target.points);
    deviation += Math.abs((totals.ticks[teamSlot] ?? 0) - target.ticks);
    deviation += TRIPLE_SECONDS_WEIGHT * Math.abs((totals.tripleSeconds[teamSlot] ?? 0) - tripleTarget);
  }
  return deviation;
}

// When no zone-count-legal labeling exists (heavily degraded film data), label greedily so a
// curve is still produced; reconciliation absorbs the resulting error.
function greedyLabeling(groups: readonly EventGroup[], quotas: readonly TeamQuota[]): Label[] {
  const zones: ZoneState = { owned: [1, 1], neutral: NEUTRAL_ZONE_COUNT };
  const capturesUsed: [number, number] = [0, 0];
  return groups.map((group) => {
    const quota = Preconditions.checkExists(quotas[group.teamSlot]);
    const me = group.teamSlot;
    // a multi-credit group is certainly a capture even when quotas disagree with the film
    if (group.credits > 1 || (capturesUsed[me] < quota.captures && isCaptureLegal(zones, me))) {
      capturesUsed[me] += 1;
      applyCapture(zones, me);
      return "capture";
    }
    return "secure";
  });
}

// DFS over the single-credit groups (multi-credit groups are forced captures): prunes label
// choices that break zone-count legality or make the remaining quotas unreachable, and
// evaluates every complete labeling against the API totals, keeping the best.
function findBestLabeling(
  groups: readonly EventGroup[],
  skeleton: readonly SkeletonBoundary[],
  targets: readonly TeamTargets[],
  quotas: readonly TeamQuota[],
  durationMs: number,
): Label[] {
  const remainingSingles: [number[], number[]] = [
    new Array<number>(groups.length + 1).fill(0),
    new Array<number>(groups.length + 1).fill(0),
  ];
  const remainingGroups: [number[], number[]] = [
    new Array<number>(groups.length + 1).fill(0),
    new Array<number>(groups.length + 1).fill(0),
  ];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = Preconditions.checkExists(groups[index]);
    for (const teamSlot of [0, 1] as const) {
      const isTeam = group.teamSlot === teamSlot;
      remainingSingles[teamSlot][index] =
        (remainingSingles[teamSlot][index + 1] ?? 0) + (isTeam && group.credits === 1 ? 1 : 0);
      remainingGroups[teamSlot][index] = (remainingGroups[teamSlot][index + 1] ?? 0) + (isTeam ? 1 : 0);
    }
  }

  // holder object rather than a plain `let`: TypeScript does not track assignments made inside
  // the visit closure, so a direct variable narrows to null at the final read
  const best: { value: { labels: Label[]; deviation: number } | null } = { value: null };
  let candidateCount = 0;
  let nodeCount = 0;
  const labels: Label[] = new Array<Label>(groups.length).fill("capture");
  const zones: ZoneState = { owned: [1, 1], neutral: NEUTRAL_ZONE_COUNT };
  const capturesUsed: [number, number] = [0, 0];
  const securesUsed: [number, number] = [0, 0];

  const visit = (index: number): void => {
    nodeCount += 1;
    if (candidateCount >= MAX_CANDIDATES || nodeCount >= MAX_SEARCH_NODES) {
      return;
    }
    if (index === groups.length) {
      candidateCount += 1;
      const totals = sweep(groups, skeleton, labels, durationMs);
      const deviation = deviationFromTargets(totals, targets);
      if (best.value == null || deviation < best.value.deviation) {
        best.value = { labels: [...labels], deviation };
      }
      return;
    }
    const group = Preconditions.checkExists(groups[index]);
    const me = group.teamSlot;
    const quota = Preconditions.checkExists(quotas[me]);

    const canCapture =
      capturesUsed[me] < quota.captures &&
      isCaptureLegal(zones, me) &&
      quota.secures - securesUsed[me] <= (remainingSingles[me][index + 1] ?? 0);
    if (canCapture) {
      const taken = applyCapture(zones, me);
      capturesUsed[me] += 1;
      labels[index] = "capture";
      visit(index + 1);
      capturesUsed[me] -= 1;
      undoCapture(zones, me, taken);
    }

    const canSecure =
      group.credits === 1 &&
      securesUsed[me] < quota.secures &&
      zones.owned[me] >= 1 &&
      quota.captures - capturesUsed[me] <= (remainingGroups[me][index + 1] ?? 0);
    if (canSecure) {
      securesUsed[me] += 1;
      labels[index] = "secure";
      visit(index + 1);
      securesUsed[me] -= 1;
      labels[index] = "capture";
    }
  };

  visit(0);

  return best.value?.labels ?? greedyLabeling(groups, quotas);
}

// Scales each team's raw curve so its final value lands exactly on the API Score, rounding
// monotonically. Every rate boundary emits a point, so scoreless stretches render as flat
// segments and scoring stretches as ramps. A team the model never gets scoring (degraded film
// data) falls back to a uniform ramp rather than a flat zero line jumping at the buzzer.
function buildScorePoints(
  groups: readonly EventGroup[],
  skeleton: readonly SkeletonBoundary[],
  labels: readonly Label[],
  teamIds: readonly number[],
  targets: readonly TeamTargets[],
  durationMs: number,
): StrongholdsScorePoint[] {
  const samples: CurveSample[] = [];
  const totals = sweep(groups, skeleton, labels, durationMs, (sample) => {
    samples.push(sample);
  });

  const valueAt = (teamSlot: number, sample: CurveSample): number => {
    const target = Preconditions.checkExists(targets[teamSlot]);
    if (sample.timestampMs >= durationMs) {
      return target.points;
    }
    const raw = totals.points[teamSlot] ?? 0;
    if (raw <= 0) {
      return Math.round((target.points * sample.timestampMs) / durationMs);
    }
    return Math.round(((sample.points[teamSlot] ?? 0) * target.points) / raw);
  };

  const points: StrongholdsScorePoint[] = [];
  for (const sample of samples) {
    const runningScores: Record<string, number> = {};
    for (const [teamSlot, teamId] of teamIds.entries()) {
      runningScores[String(teamId)] = valueAt(teamSlot, sample);
    }
    points.push({ timestampMs: sample.timestampMs, runningScores });
  }
  return points;
}

// Samples the reconstructed curve at a timestamp; scoring is continuous, so values between
// emitted points interpolate linearly.
export function sampleScoreAt(points: readonly StrongholdsScorePoint[], teamId: number, timestampMs: number): number {
  const key = String(teamId);
  let previous = { timestampMs: 0, value: 0 };
  for (const point of points) {
    const value = point.runningScores[key] ?? 0;
    if (point.timestampMs >= timestampMs) {
      const span = point.timestampMs - previous.timestampMs;
      if (span === 0) {
        return value;
      }
      return previous.value + ((value - previous.value) * (timestampMs - previous.timestampMs)) / span;
    }
    previous = { timestampMs: point.timestampMs, value };
  }
  return previous.value;
}

export function buildStrongholdsProgression(
  events: readonly ParsedHighlightEvent[],
  matchStats: MatchStats,
  durationMs: number,
): StrongholdsProgression {
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const targetsByTeamId = new Map<number, TeamTargets>();
  for (const team of matchStats.Teams) {
    if (!("ZonesStats" in team.Stats)) {
      continue;
    }
    targetsByTeamId.set(team.TeamId, {
      captures: team.Stats.ZonesStats.StrongholdCaptures,
      secures: team.Stats.ZonesStats.StrongholdSecures,
      points: team.Stats.CoreStats.Score,
      ticks: team.Stats.ZonesStats.StrongholdScoringTicks,
    });
  }
  if (teamIds.length !== 2 || targetsByTeamId.size !== 2 || durationMs <= 0) {
    return { events: [], teamCount: teamIds.length };
  }
  const targets = teamIds.map((teamId) => Preconditions.checkExists(targetsByTeamId.get(teamId)));

  const groups = groupCarryEvents(events, teamIds);
  if (groups.length === 0) {
    return { events: [], teamCount: teamIds.length };
  }

  const skeleton = buildSkeleton(groups);
  const quotas = resolveQuotas(groups, targets);
  const labels = findBestLabeling(groups, skeleton, targets, quotas, durationMs);

  return {
    events: buildScorePoints(groups, skeleton, labels, teamIds, targets, durationMs),
    teamCount: teamIds.length,
  };
}
