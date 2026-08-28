import { describe, expect, it } from "vitest";
import type { RosterSubstitutionOptions } from "../roster-substitution";
import { applyRosterSubstitution } from "../roster-substitution";

describe("applyRosterSubstitution()", () => {
  const options = (playerOutId: string, playerInId: string): RosterSubstitutionOptions<string> => ({
    playerOutId,
    playerInId,
    getId: (player: string): string => player,
    createPlayerIn: (): string => playerInId,
  });

  it("replaces the subbed out player when the subbed in player is not on the roster", () => {
    const teams = [
      ["a", "b"],
      ["c", "d"],
    ];

    const result = applyRosterSubstitution(teams, options("c", "e"));

    expect(result).toEqual({ teamIndex: 1, isSwap: false });
    expect(teams).toEqual([
      ["a", "b"],
      ["e", "d"],
    ]);
  });

  it("swaps both players when the subbed in player is already on another team", () => {
    const teams = [
      ["a", "b"],
      ["c", "d"],
    ];

    const result = applyRosterSubstitution(teams, options("b", "c"));

    expect(result).toEqual({ teamIndex: 0, isSwap: true });
    expect(teams).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("swaps both players when they are on the same team", () => {
    const teams = [["a", "b", "c"]];

    const result = applyRosterSubstitution(teams, options("a", "c"));

    expect(result).toEqual({ teamIndex: 0, isSwap: true });
    expect(teams).toEqual([["c", "b", "a"]]);
  });

  it("leaves the roster untouched when the subbed out player is not found", () => {
    const teams = [["a", "b"]];

    const result = applyRosterSubstitution(teams, options("z", "c"));

    expect(result).toEqual({ teamIndex: -1, isSwap: false });
    expect(teams).toEqual([["a", "b"]]);
  });

  it("never duplicates a player across repeated swap events", () => {
    const teams = [
      ["a", "b"],
      ["c", "d"],
    ];

    applyRosterSubstitution(teams, options("a", "c"));
    applyRosterSubstitution(teams, options("a", "d"));

    expect(teams.flat().toSorted()).toEqual(["a", "b", "c", "d"]);
  });

  it("uses the object identity of existing roster entries when swapping", () => {
    const playerA = { id: "a" };
    const playerC = { id: "c" };
    const teams = [[playerA], [playerC]];

    applyRosterSubstitution(teams, {
      playerOutId: "a",
      playerInId: "c",
      getId: (player): string => player.id,
      createPlayerIn: (): { id: string } => ({ id: "c" }),
    });

    expect(teams[0]?.[0]).toBe(playerC);
    expect(teams[1]?.[0]).toBe(playerA);
  });
});
