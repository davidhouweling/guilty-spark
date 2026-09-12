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
// integrated points/ticks/triple-seconds best match the API totals.
const ATTEMPT_WINDOW_MS = 6_500;
const TRIPLE_SECONDS_WEIGHT = 2;
const MAX_CANDIDATES = 150_000;
const ZONE_COUNT = 3;

export interface StrongholdsScorePoint {
  timestampMs: number;
  teamId: number;
  runningScores: Record<string, number>;
}

export interface StrongholdsProgression {
  events: StrongholdsScorePoint[];
  teamCount: number;
}

interface EventGroup {
  timestampMs: number;
  teamId: number;
  credits: number;
}

interface TeamTargets {
  captures: number;
  secures: number;
  points: number;
  ticks: number;
}

type Label = "capture" | "secure";

interface Boundary {
  timestampMs: number;
  // end-of-window decrements sort before start-of-window increments at the same instant
  order: number;
  attackDelta: Map<number, number>;
  flipTeamId: number | null;
}

interface IntegrationTotals {
  points: Map<number, number>;
  ticks: Map<number, number>;
  tripleSeconds: Map<number, number>;
}

interface CurveSample {
  timestampMs: number;
  points: Map<number, number>;
}

interface Candidate {
  labels: Label[];
  deviation: number;
}

function groupCarryEvents(events: readonly ParsedHighlightEvent[], knownTeamIds: ReadonlySet<number>): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of events) {
    if (event.eventType !== "mode" || event.teamId == null || !knownTeamIds.has(event.teamId)) {
      continue;
    }
    const key = `${String(event.timeMs)}:${String(event.teamId)}`;
    const existing = groups.get(key);
    if (existing == null) {
      groups.set(key, { timestampMs: event.timeMs, teamId: event.teamId, credits: 1 });
    } else {
      existing.credits += 1;
    }
  }
  return [...groups.values()].sort((a, b) => a.timestampMs - b.timestampMs || a.teamId - b.teamId);
}

// Quotas come from the API; when the film misses events (or credits drift) the group count can
// disagree — clamp so every group still gets a label and secures never exceed the single-credit
// groups they can occupy.
function resolveQuotas(
  groups: readonly EventGroup[],
  teamIds: readonly number[],
  targets: Map<number, TeamTargets>,
): Map<number, { captures: number; secures: number }> {
  const quotas = new Map<number, { captures: number; secures: number }>();
  for (const teamId of teamIds) {
    const target = Preconditions.checkExists(targets.get(teamId));
    const teamGroups = groups.filter((g) => g.teamId === teamId);
    const singles = teamGroups.filter((g) => g.credits === 1).length;
    let secures = Math.min(target.secures, singles);
    let captures = teamGroups.length - secures;
    if (captures < 0) {
      captures = 0;
      secures = teamGroups.length;
    }
    quotas.set(teamId, { captures, secures });
  }
  return quotas;
}

function buildBoundaries(
  groups: readonly EventGroup[],
  labels: readonly Label[],
  teamIds: readonly number[],
): Boundary[] {
  const [teamA, teamB] = teamIds;
  const boundaries: Boundary[] = [];
  for (const [index, group] of groups.entries()) {
    const label = Preconditions.checkExists(labels[index]);
    const attackedTeamId =
      label === "capture"
        ? group.teamId === teamA
          ? Preconditions.checkExists(teamB)
          : Preconditions.checkExists(teamA)
        : group.teamId;
    const windowStartMs = Math.max(0, group.timestampMs - ATTEMPT_WINDOW_MS);
    boundaries.push({
      timestampMs: windowStartMs,
      order: 2,
      attackDelta: new Map([[attackedTeamId, 1]]),
      flipTeamId: null,
    });
    boundaries.push({
      timestampMs: group.timestampMs,
      order: 0,
      attackDelta: new Map([[attackedTeamId, -1]]),
      flipTeamId: null,
    });
    if (label === "capture") {
      boundaries.push({ timestampMs: group.timestampMs, order: 1, attackDelta: new Map(), flipTeamId: group.teamId });
    }
  }
  return boundaries.sort((a, b) => a.timestampMs - b.timestampMs || a.order - b.order);
}

function scoreRatePerSecond(effectiveZones: number): number {
  if (effectiveZones >= ZONE_COUNT) {
    return 2;
  }
  return effectiveZones === 2 ? 1 : 0;
}

// Sweeps the piecewise-constant rate function over the match. Ranked Strongholds spawns each
// team owning its home zone with the middle zone neutral (observed on every theatre-verified
// film); a capture takes the neutral zone while it remains, otherwise an enemy zone.
function integrate(
  groups: readonly EventGroup[],
  labels: readonly Label[],
  teamIds: readonly number[],
  durationMs: number,
  onSample: ((sample: CurveSample) => void) | null,
): IntegrationTotals {
  const boundaries = buildBoundaries(groups, labels, teamIds);
  const owned = new Map<number, number>(teamIds.map((id) => [id, 1]));
  let neutral = ZONE_COUNT - teamIds.length;
  const attacks = new Map<number, number>(teamIds.map((id) => [id, 0]));
  const points = new Map<number, number>(teamIds.map((id) => [id, 0]));
  const ticks = new Map<number, number>(teamIds.map((id) => [id, 0]));
  const tripleSeconds = new Map<number, number>(teamIds.map((id) => [id, 0]));

  let cursorMs = 0;
  const advanceTo = (timestampMs: number): void => {
    const clamped = Math.min(timestampMs, durationMs);
    if (clamped <= cursorMs) {
      return;
    }
    const seconds = (clamped - cursorMs) / 1000;
    for (const teamId of teamIds) {
      const effective = Math.max((owned.get(teamId) ?? 0) - (attacks.get(teamId) ?? 0), 0);
      const rate = scoreRatePerSecond(effective);
      points.set(teamId, (points.get(teamId) ?? 0) + rate * seconds);
      if (rate > 0) {
        ticks.set(teamId, (ticks.get(teamId) ?? 0) + seconds);
      }
      if (effective >= ZONE_COUNT) {
        tripleSeconds.set(teamId, (tripleSeconds.get(teamId) ?? 0) + seconds);
      }
    }
    cursorMs = clamped;
    onSample?.({ timestampMs: cursorMs, points: new Map(points) });
  };

  for (const boundary of boundaries) {
    advanceTo(boundary.timestampMs);
    for (const [teamId, delta] of boundary.attackDelta) {
      attacks.set(teamId, (attacks.get(teamId) ?? 0) + delta);
    }
    if (boundary.flipTeamId != null) {
      const capturer = boundary.flipTeamId;
      if (neutral > 0) {
        neutral -= 1;
      } else {
        const enemyId = teamIds.find((id) => id !== capturer && (owned.get(id) ?? 0) > 0);
        if (enemyId != null) {
          owned.set(enemyId, (owned.get(enemyId) ?? 0) - 1);
        }
      }
      owned.set(capturer, Math.min((owned.get(capturer) ?? 0) + 1, ZONE_COUNT));
    }
  }
  advanceTo(durationMs);

  return { points, ticks, tripleSeconds };
}

function deviationFromTargets(
  totals: IntegrationTotals,
  teamIds: readonly number[],
  targets: Map<number, TeamTargets>,
): number {
  let deviation = 0;
  for (const teamId of teamIds) {
    const target = Preconditions.checkExists(targets.get(teamId));
    const tripleTarget = Math.max(target.points - target.ticks, 0);
    deviation += Math.abs((totals.points.get(teamId) ?? 0) - target.points);
    deviation += Math.abs((totals.ticks.get(teamId) ?? 0) - target.ticks);
    deviation += TRIPLE_SECONDS_WEIGHT * Math.abs((totals.tripleSeconds.get(teamId) ?? 0) - tripleTarget);
  }
  return deviation;
}

// DFS over the single-credit groups (multi-credit groups are forced captures): prunes label
// choices that break zone-count legality or make the remaining quotas unreachable, and
// evaluates every complete labeling against the API totals, keeping the best.
function findBestLabeling(
  groups: readonly EventGroup[],
  teamIds: readonly number[],
  targets: Map<number, TeamTargets>,
  durationMs: number,
): Candidate | null {
  const quotas = resolveQuotas(groups, teamIds, targets);
  const [teamA, teamB] = teamIds;
  const remainingSingles = new Map<number, number[]>(
    teamIds.map((id) => [id, new Array<number>(groups.length + 1).fill(0)]),
  );
  const remainingGroups = new Map<number, number[]>(
    teamIds.map((id) => [id, new Array<number>(groups.length + 1).fill(0)]),
  );
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = Preconditions.checkExists(groups[index]);
    for (const teamId of teamIds) {
      const singlesSuffix = Preconditions.checkExists(remainingSingles.get(teamId));
      const groupsSuffix = Preconditions.checkExists(remainingGroups.get(teamId));
      const isTeam = group.teamId === teamId;
      singlesSuffix[index] = (singlesSuffix[index + 1] ?? 0) + (isTeam && group.credits === 1 ? 1 : 0);
      groupsSuffix[index] = (groupsSuffix[index + 1] ?? 0) + (isTeam ? 1 : 0);
    }
  }

  let best: Candidate | null = null;
  let candidateCount = 0;

  {
    const labels: Label[] = new Array<Label>(groups.length).fill("capture");
    const owned = new Map<number, number>(teamIds.map((id) => [id, 1]));
    const capturesUsed = new Map<number, number>(teamIds.map((id) => [id, 0]));
    const securesUsed = new Map<number, number>(teamIds.map((id) => [id, 0]));
    let neutral = ZONE_COUNT - teamIds.length;

    const visit = (index: number): void => {
      if (candidateCount >= MAX_CANDIDATES) {
        return;
      }
      if (index === groups.length) {
        candidateCount += 1;
        const totals = integrate(groups, labels, teamIds, durationMs, null);
        const deviation = deviationFromTargets(totals, teamIds, targets);
        if (best == null || deviation < best.deviation) {
          best = { labels: [...labels], deviation };
        }
        return;
      }
      const group = Preconditions.checkExists(groups[index]);
      const { teamId } = group;
      const enemyId = teamId === teamA ? Preconditions.checkExists(teamB) : Preconditions.checkExists(teamA);
      const quota = Preconditions.checkExists(quotas.get(teamId));
      const singlesSuffix = Preconditions.checkExists(remainingSingles.get(teamId));
      const groupsSuffix = Preconditions.checkExists(remainingGroups.get(teamId));

      const tryCapture = (): void => {
        const own = owned.get(teamId) ?? 0;
        const enemyOwned = owned.get(enemyId) ?? 0;
        if (
          (capturesUsed.get(teamId) ?? 0) >= quota.captures ||
          own >= ZONE_COUNT ||
          (neutral === 0 && enemyOwned === 0)
        ) {
          return;
        }
        const securesLeft = quota.secures - (securesUsed.get(teamId) ?? 0);
        if (securesLeft > (singlesSuffix[index + 1] ?? 0)) {
          return;
        }
        const tookNeutral = neutral > 0;
        if (tookNeutral) {
          neutral -= 1;
        } else {
          owned.set(enemyId, enemyOwned - 1);
        }
        owned.set(teamId, own + 1);
        capturesUsed.set(teamId, (capturesUsed.get(teamId) ?? 0) + 1);
        labels[index] = "capture";
        visit(index + 1);
        capturesUsed.set(teamId, (capturesUsed.get(teamId) ?? 0) - 1);
        owned.set(teamId, own);
        if (tookNeutral) {
          neutral += 1;
        } else {
          owned.set(enemyId, enemyOwned);
        }
      };

      const trySecure = (): void => {
        if (group.credits > 1 || (securesUsed.get(teamId) ?? 0) >= quota.secures || (owned.get(teamId) ?? 0) < 1) {
          return;
        }
        const capturesLeft = quota.captures - (capturesUsed.get(teamId) ?? 0);
        if (capturesLeft > (groupsSuffix[index + 1] ?? 0)) {
          return;
        }
        securesUsed.set(teamId, (securesUsed.get(teamId) ?? 0) + 1);
        labels[index] = "secure";
        visit(index + 1);
        securesUsed.set(teamId, (securesUsed.get(teamId) ?? 0) - 1);
        labels[index] = "capture";
      };

      tryCapture();
      trySecure();
    };

    visit(0);
  }

  return best;
}

// Scales each team's raw curve so its final value lands exactly on the API Score, rounding
// monotonically; one point is emitted per rate boundary where a rounded value changed, and
// the chart draws straight ramps between them (scoring is continuous, not stepped).
function buildScorePoints(
  groups: readonly EventGroup[],
  candidate: Candidate,
  teamIds: readonly number[],
  targets: Map<number, TeamTargets>,
  durationMs: number,
): StrongholdsScorePoint[] {
  const samples: CurveSample[] = [];
  const totals = integrate(groups, candidate.labels, teamIds, durationMs, (sample) => {
    samples.push(sample);
  });
  const scale = new Map<number, number>();
  for (const teamId of teamIds) {
    const raw = totals.points.get(teamId) ?? 0;
    const target = Preconditions.checkExists(targets.get(teamId));
    scale.set(teamId, raw > 0 ? target.points / raw : 0);
  }

  const points: StrongholdsScorePoint[] = [];
  const lastEmitted = new Map<number, number>(teamIds.map((id) => [id, 0]));
  for (const sample of samples) {
    let changedTeamId: number | null = null;
    let changedDelta = 0;
    const runningScores: Record<string, number> = {};
    for (const teamId of teamIds) {
      const value =
        sample.timestampMs >= durationMs
          ? Preconditions.checkExists(targets.get(teamId)).points
          : Math.round((sample.points.get(teamId) ?? 0) * (scale.get(teamId) ?? 0));
      runningScores[String(teamId)] = value;
      const delta = value - (lastEmitted.get(teamId) ?? 0);
      if (delta > changedDelta) {
        changedDelta = delta;
        changedTeamId = teamId;
      }
    }
    if (changedTeamId == null && sample.timestampMs < durationMs) {
      continue;
    }
    for (const teamId of teamIds) {
      lastEmitted.set(teamId, runningScores[String(teamId)] ?? 0);
    }
    points.push({
      timestampMs: sample.timestampMs,
      teamId: changedTeamId ?? Preconditions.checkExists(teamIds[0]),
      runningScores,
    });
  }
  return points;
}

export function buildStrongholdsProgression(
  events: readonly ParsedHighlightEvent[],
  matchStats: MatchStats,
  durationMs: number,
): StrongholdsProgression {
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const targets = new Map<number, TeamTargets>();
  for (const team of matchStats.Teams) {
    if (!("ZonesStats" in team.Stats)) {
      continue;
    }
    targets.set(team.TeamId, {
      captures: team.Stats.ZonesStats.StrongholdCaptures,
      secures: team.Stats.ZonesStats.StrongholdSecures,
      points: team.Stats.CoreStats.Score,
      ticks: team.Stats.ZonesStats.StrongholdScoringTicks,
    });
  }
  if (teamIds.length !== 2 || targets.size !== 2) {
    return { events: [], teamCount: teamIds.length };
  }

  const groups = groupCarryEvents(events, new Set(teamIds));
  if (groups.length === 0) {
    return { events: [], teamCount: teamIds.length };
  }

  const candidate = findBestLabeling(groups, teamIds, targets, durationMs);
  if (candidate == null) {
    return { events: [], teamCount: teamIds.length };
  }

  return {
    events: buildScorePoints(groups, candidate, teamIds, targets, durationMs),
    teamCount: teamIds.length,
  };
}
