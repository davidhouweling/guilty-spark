import type { ScoreProgressionTeamLine } from "../types";

export function aFakeTeamLineWith(overrides: Partial<ScoreProgressionTeamLine> = {}): ScoreProgressionTeamLine {
  return {
    teamId: 0,
    name: "Eagle",
    color: "#0000ff",
    points: [],
    ...overrides,
  };
}
