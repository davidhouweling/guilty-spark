interface RosterLocation<T> {
  teamIndex: number;
  playerIndex: number;
  team: T[];
  player: T;
}

export interface RosterSubstitutionOptions<T> {
  playerOutId: string;
  playerInId: string;
  getId: (player: T) => string | null | undefined;
  createPlayerIn: () => T;
}

export interface RosterSubstitutionResult {
  /** Index of the team the subbed in player now belongs to, or -1 when the subbed out player was not on the roster. */
  teamIndex: number;
  /** True when both players were already on the roster and traded places. */
  isSwap: boolean;
}

function findRosterLocation<T>(
  teams: T[][],
  playerId: string,
  getId: (player: T) => string | null | undefined,
): RosterLocation<T> | null {
  for (const [teamIndex, team] of teams.entries()) {
    for (const [playerIndex, player] of team.entries()) {
      if (getId(player) === playerId) {
        return { teamIndex, playerIndex, team, player };
      }
    }
  }

  return null;
}

/**
 * NeatQueue also emits a substitution when two players already in the match trade teams, in which case the
 * subbed in player must move into the subbed out player's slot rather than overwrite it.
 */
export function applyRosterSubstitution<T>(
  teams: T[][],
  options: RosterSubstitutionOptions<T>,
): RosterSubstitutionResult {
  const { playerOutId, playerInId, getId, createPlayerIn } = options;
  const outLocation = findRosterLocation(teams, playerOutId, getId);
  if (outLocation == null) {
    return { teamIndex: -1, isSwap: false };
  }

  const inLocation = findRosterLocation(teams, playerInId, getId);
  if (inLocation == null) {
    outLocation.team[outLocation.playerIndex] = createPlayerIn();

    return { teamIndex: outLocation.teamIndex, isSwap: false };
  }

  outLocation.team[outLocation.playerIndex] = inLocation.player;
  inLocation.team[inLocation.playerIndex] = outLocation.player;

  return { teamIndex: outLocation.teamIndex, isSwap: true };
}
