import { getTeamName } from "@guilty-spark/shared/halo/team";

export function getTeamNameWithOverride(teamId: number, overrides: ReadonlyMap<number, string>): string {
  return overrides.get(teamId) ?? getTeamName(teamId);
}
