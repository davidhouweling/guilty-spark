// Resolves which side of a series (a stable seriesTeamId) each match's raw team corresponds to,
// allowing a team to swap sides between matches without inferring roster substitutions.

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

  const identity = resolvePairing(
    [
      [expectedA, matchA],
      [expectedB, matchB],
    ],
  );
  const swapped = resolvePairing(
    [
      [expectedA, matchB],
      [expectedB, matchA],
    ],
  );

  if (identity == null) {
    return swapped?.resolutions ?? null;
  }
  if (swapped == null) {
    return identity.resolutions;
  }

  return swapped.totalMismatches < identity.totalMismatches ? swapped.resolutions : identity.resolutions;
}
