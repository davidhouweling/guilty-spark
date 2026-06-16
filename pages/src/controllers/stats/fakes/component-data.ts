import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "../types";

export function aFakeMatchStatsValuesWith(overrides?: Partial<MatchStatsValues>): MatchStatsValues {
  return {
    name: "Kills",
    value: 10,
    bestInTeam: false,
    bestInMatch: false,
    display: "10",
    icon: undefined,
    ...overrides,
  };
}

export function aFakeMatchStatsMedalWith(overrides?: Partial<MedalEntry>): MedalEntry {
  return {
    name: "Killing Spree",
    count: 1,
    sortingWeight: 100,
    ...overrides,
  };
}

export function aFakeMatchStatsPlayerDataWith(overrides?: Partial<MatchStatsPlayerData>): MatchStatsPlayerData {
  return {
    name: "Player1",
    values: [
      aFakeMatchStatsValuesWith({ name: "Kills", value: 10 }),
      aFakeMatchStatsValuesWith({ name: "Deaths", value: 5 }),
      aFakeMatchStatsValuesWith({ name: "Assists", value: 3 }),
    ],
    medals: [aFakeMatchStatsMedalWith()],
    ...overrides,
  };
}

export function aFakeMatchStatsDataWith(overrides?: Partial<MatchStatsData>): MatchStatsData {
  return {
    teamId: 0,
    teamStats: [
      aFakeMatchStatsValuesWith({ name: "Kills", value: 20 }),
      aFakeMatchStatsValuesWith({ name: "Deaths", value: 15 }),
      aFakeMatchStatsValuesWith({ name: "Score", value: 50 }),
    ],
    players: [
      aFakeMatchStatsPlayerDataWith({ name: "Player1" }),
      aFakeMatchStatsPlayerDataWith({
        name: "Player2",
        values: [aFakeMatchStatsValuesWith({ name: "Kills", value: 8 })],
      }),
    ],
    teamMedals: [
      aFakeMatchStatsMedalWith({ name: "Killing Spree", count: 2 }),
      aFakeMatchStatsMedalWith({ name: "Double Kill", count: 5, sortingWeight: 50 }),
    ],
    ...overrides,
  };
}
