// Resolves which side of a series (a stable seriesTeamId) each match's raw team corresponds to,
// allowing a team to swap sides between matches without inferring roster substitutions.

import type { MatchStats } from "halo-infinite-api";

export interface SeriesTeamRoster {
  readonly seriesTeamId: number;
  readonly xuids: ReadonlySet<string>;
}

export interface MatchTeamRoster {
  readonly matchTeamId: number;
  readonly xuids: ReadonlySet<string>;
}

export interface SeriesTeamResolution {
  readonly seriesTeamId: number;
  readonly matchTeamId: number;
  readonly addedXuids: readonly string[];
  readonly removedXuids: readonly string[];
}

interface PairingResult {
  readonly totalMismatches: number;
  readonly resolutions: SeriesTeamResolution[];
}

function resolvePairing(pairs: readonly [SeriesTeamRoster, MatchTeamRoster][]): PairingResult | null {
  let totalMismatches = 0;
  const resolutions: SeriesTeamResolution[] = [];

  for (const [expected, matched] of pairs) {
    const removedXuids = Array.from(expected.xuids).filter((xuid) => !matched.xuids.has(xuid));
    const addedXuids = Array.from(matched.xuids).filter((xuid) => !expected.xuids.has(xuid));
    if (removedXuids.length > 0 || addedXuids.length > 0) {
      return null;
    }

    totalMismatches += removedXuids.length + addedXuids.length;
    resolutions.push({
      seriesTeamId: expected.seriesTeamId,
      matchTeamId: matched.matchTeamId,
      addedXuids,
      removedXuids,
    });
  }

  return { totalMismatches, resolutions };
}

/**
 * Resolves a 2-team series' expected rosters against a single match's rosters, picking whichever
 * of the two possible pairings (same side, or swapped sides) has equal rosters. Returns null when
 * any player differs: substitutions are accepted only after their NeatQueue event updates the
 * series baseline roster.
 */
export function resolveSeriesTeamMapping(
  expectedRosters: readonly SeriesTeamRoster[],
  matchRosters: readonly MatchTeamRoster[],
): SeriesTeamResolution[] | null {
  if (expectedRosters.length !== 2 || matchRosters.length !== 2) {
    return null;
  }

  const [expectedA, expectedB] = expectedRosters as [SeriesTeamRoster, SeriesTeamRoster];
  const [matchA, matchB] = matchRosters as [MatchTeamRoster, MatchTeamRoster];

  const identity = resolvePairing([
    [expectedA, matchA],
    [expectedB, matchB],
  ]);
  const swapped = resolvePairing([
    [expectedA, matchB],
    [expectedB, matchA],
  ]);

  if (identity == null) {
    return swapped?.resolutions ?? null;
  }
  if (swapped == null) {
    return identity.resolutions;
  }

  return swapped.totalMismatches < identity.totalMismatches ? swapped.resolutions : identity.resolutions;
}

/**
 * Builds each present-at-beginning team's roster (by raw match `TeamId`) for a single match.
 * Returns null when the match doesn't split present-at-beginning players into exactly two teams,
 * since series team-identity resolution only supports 2-team series.
 */
export function buildPresentAtBeginningTeamRosters(match: MatchStats): MatchTeamRoster[] | null {
  const rosters = new Map<number, Set<string>>();
  for (const player of match.Players) {
    if (!player.ParticipationInfo.PresentAtBeginning) {
      continue;
    }

    const roster = rosters.get(player.LastTeamId) ?? new Set<string>();
    roster.add(player.PlayerId);
    rosters.set(player.LastTeamId, roster);
  }

  if (rosters.size !== 2) {
    return null;
  }

  return Array.from(rosters.entries()).map(([matchTeamId, xuids]) => ({ matchTeamId, xuids }));
}

/**
 * Resolves a single match's raw `TeamId`s against an anchor match's rosters (whose own `TeamId`s
 * are reused as the stable seriesTeamId labels), returning a map of this match's `TeamId` to the
 * anchor-derived seriesTeamId. Returns null if there is no anchor or the match can't be resolved
 * to the anchor's rosters within tolerance.
 */
export function resolveMatchTeamIdToSeriesTeamId(
  anchorRosters: readonly MatchTeamRoster[] | null,
  match: MatchStats,
  options?: ResolveSeriesTeamMappingOptions,
): ReadonlyMap<number, number> | null {
  if (anchorRosters == null) {
    return null;
  }

  const matchRosters = buildPresentAtBeginningTeamRosters(match);
  if (matchRosters == null) {
    return null;
  }

  const resolution = resolveSeriesTeamMapping(
    anchorRosters.map((roster) => ({ seriesTeamId: roster.matchTeamId, xuids: roster.xuids })),
    matchRosters,
    options,
  );
  if (resolution == null) {
    return null;
  }

  return new Map(resolution.map((entry) => [entry.matchTeamId, entry.seriesTeamId]));
}
