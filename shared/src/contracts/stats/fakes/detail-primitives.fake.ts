import { StatsValueSortBy } from "../../../halo/stat-formatting";
import type {
  CondensedMedal,
  CondensedPlayer,
  CondensedPlayerTeamStats,
  CondensedStat,
  CondensedTeam,
} from "../detail-primitives";

export function aFakeCondensedStatWith(
  overrides: Partial<Extract<CondensedStat, { status: "available" }>> = {},
): Extract<CondensedStat, { status: "available" }> {
  return {
    key: "Kills",
    name: "Kills",
    sortBy: StatsValueSortBy.DESC,
    isComparable: true,
    format: "number",
    status: "available",
    value: 12,
    ...overrides,
  };
}

export function aFakeCondensedMedalWith(overrides: Partial<CondensedMedal> = {}): CondensedMedal {
  return {
    id: 1,
    count: 2,
    name: "Double Kill",
    sortingWeight: 50,
    difficultyIndex: 0,
    difficulty: "Normal",
    ...overrides,
  };
}

export function aFakeCondensedPlayerTeamStatsWith(
  overrides: Partial<CondensedPlayerTeamStats> = {},
): CondensedPlayerTeamStats {
  return {
    matchTeamId: 7,
    seriesTeamId: 0,
    stats: [aFakeCondensedStatWith()],
    medals: [aFakeCondensedMedalWith()],
    ...overrides,
  };
}

export function aFakeCondensedPlayerWith(overrides: Partial<CondensedPlayer> = {}): CondensedPlayer {
  return {
    playerId: "xuid(1234567890)",
    xuid: "1234567890",
    gamertag: "Spartan One",
    playerType: 1,
    lastMatchTeamId: 7,
    outcome: "Win",
    rank: 1,
    participation: {
      presentAtBeginning: true,
      joinedInProgress: false,
      leftInProgress: false,
      presentAtCompletion: true,
    },
    teamStats: [aFakeCondensedPlayerTeamStatsWith()],
    ...overrides,
  };
}

export function aFakeCondensedTeamWith(overrides: Partial<CondensedTeam> = {}): CondensedTeam {
  return {
    matchTeamId: 7,
    seriesTeamId: 0,
    name: "Eagle",
    outcome: "Win",
    rank: 1,
    playerIds: ["xuid(1234567890)"],
    stats: [aFakeCondensedStatWith()],
    medals: [aFakeCondensedMedalWith()],
    ...overrides,
  };
}
