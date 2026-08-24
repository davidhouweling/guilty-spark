import type { MatchStats } from "halo-infinite-api";

type PlayerStats = MatchStats["Players"][number]["PlayerTeamStats"][number]["Stats"];

export function serializeObjectiveStats(stats: PlayerStats): string {
  const objectiveStats = Object.fromEntries(Object.entries(stats).filter(([key]) => key !== "CoreStats"));
  return JSON.stringify(objectiveStats);
}
