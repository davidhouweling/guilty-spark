import { describe, expect, it } from "vitest";
import { getTeamName } from "../team";

describe("getTeamName()", () => {
  it.each([
    { teamId: 0, teamName: "Eagle" },
    { teamId: 1, teamName: "Cobra" },
    { teamId: 2, teamName: "Hades" },
    { teamId: 3, teamName: "Valkyrie" },
    { teamId: 4, teamName: "Rampart" },
    { teamId: 5, teamName: "Cutlass" },
    { teamId: 6, teamName: "Valor" },
    { teamId: 7, teamName: "Hazard" },
    { teamId: 8, teamName: "Unknown" },
  ])("returns the team name for team $teamId", ({ teamId, teamName }) => {
    expect(getTeamName(teamId)).toBe(teamName);
  });
});
