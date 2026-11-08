import { StatsValueSortBy } from "../../../halo/stat-formatting";
import type { Medal, Player, PlayerTeamStats, Stat, Team } from "../detail-primitives";

export function aFakeStatWith(
  overrides: Partial<Extract<Stat, { status: "available" }>> = {},
): Extract<Stat, { status: "available" }> {
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

export function aFakeMedalWith(overrides: Partial<Medal> = {}): Medal {
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

export function aFakePlayerTeamStatsWith(overrides: Partial<PlayerTeamStats> = {}): PlayerTeamStats {
  return {
    matchTeamId: 7,
    seriesTeamId: 0,
    stats: [aFakeStatWith()],
    medals: [aFakeMedalWith()],
    ...overrides,
  };
}

export function aFakePlayerWith(overrides: Partial<Player> = {}): Player {
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
    teamStats: [aFakePlayerTeamStatsWith()],
    ...overrides,
  };
}

export function aFakeTeamWith(overrides: Partial<Team> = {}): Team {
  return {
    matchTeamId: 7,
    seriesTeamId: 0,
    name: "Eagle",
    outcome: "Win",
    rank: 1,
    playerIds: ["xuid(1234567890)"],
    stats: [aFakeStatWith()],
    medals: [aFakeMedalWith()],
    ...overrides,
  };
}
