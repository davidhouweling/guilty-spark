// Resolves which side of a series (a stable seriesTeamId) each match's raw team corresponds to,
// tolerating both ordinary roster substitutions and a team swapping sides between matches.

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

export interface ResolveSeriesTeamMappingOptions {
  readonly maxToleratedMismatchesPerTeam?: number;
}

const DEFAULT_MAX_TOLERATED_MISMATCHES_PER_TEAM = 1;

interface PairingResult {
  readonly totalMismatches: number;
  readonly resolutions: SeriesTeamResolution[];
}

function resolvePairing(
  pairs: readonly [SeriesTeamRoster, MatchTeamRoster][],
  maxToleratedMismatchesPerTeam: number,
): PairingResult | null {
  let totalMismatches = 0;
  const resolutions: SeriesTeamResolution[] = [];

  for (const [expected, matched] of pairs) {
    const removedXuids = Array.from(expected.xuids).filter((xuid) => !matched.xuids.has(xuid));
    const addedXuids = Array.from(matched.xuids).filter((xuid) => !expected.xuids.has(xuid));
    if (Math.max(removedXuids.length, addedXuids.length) > maxToleratedMismatchesPerTeam) {
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
 * of the two possible pairings (same side, or swapped sides) has the fewest roster mismatches.
 * Ties favor staying on the same side. Returns null if no pairing keeps every team within
 * `maxToleratedMismatchesPerTeam` (default 1), meaning the match does not belong to this series.
 */
export function resolveSeriesTeamMapping(
  expectedRosters: readonly SeriesTeamRoster[],
  matchRosters: readonly MatchTeamRoster[],
  options: ResolveSeriesTeamMappingOptions = {},
): SeriesTeamResolution[] | null {
  if (expectedRosters.length !== 2 || matchRosters.length !== 2) {
    return null;
  }

  const [expectedA, expectedB] = expectedRosters as [SeriesTeamRoster, SeriesTeamRoster];
  const [matchA, matchB] = matchRosters as [MatchTeamRoster, MatchTeamRoster];
  const maxToleratedMismatchesPerTeam =
    options.maxToleratedMismatchesPerTeam ?? DEFAULT_MAX_TOLERATED_MISMATCHES_PER_TEAM;

  const identity = resolvePairing(
    [
      [expectedA, matchA],
      [expectedB, matchB],
    ],
    maxToleratedMismatchesPerTeam,
  );
  const swapped = resolvePairing(
    [
      [expectedA, matchB],
      [expectedB, matchA],
    ],
    maxToleratedMismatchesPerTeam,
  );

  if (identity == null) {
    return swapped?.resolutions ?? null;
  }
  if (swapped == null) {
    return identity.resolutions;
  }

  return swapped.totalMismatches < identity.totalMismatches ? swapped.resolutions : identity.resolutions;
}
