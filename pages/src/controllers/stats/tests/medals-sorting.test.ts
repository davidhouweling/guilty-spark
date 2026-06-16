import { describe, it, expect } from "vitest";
import type { Row } from "@tanstack/react-table";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import { medalsToWeightMap, getTeamMedalsMap, getPlayerMedalsMap, sortByMedals } from "../medals-sorting";
import type { MatchStatsData, MatchStatsPlayerData } from "../types";

describe("medalsToWeightMap", () => {
  it("converts medals to weight map", () => {
    const medals: MedalEntry[] = [
      { name: "Killing Spree", count: 3, sortingWeight: 100 },
      { name: "Double Kill", count: 5, sortingWeight: 50 },
    ];

    const result = medalsToWeightMap(medals);

    expect(result.get(100)).toBe(3);
    expect(result.get(50)).toBe(5);
  });

  it("sums counts for medals with same weight", () => {
    const medals: MedalEntry[] = [
      { name: "Killing Spree", count: 3, sortingWeight: 100 },
      { name: "Running Riot", count: 2, sortingWeight: 100 },
    ];

    const result = medalsToWeightMap(medals);

    expect(result.get(100)).toBe(5);
  });

  it("handles empty medals array", () => {
    const medals: MedalEntry[] = [];

    const result = medalsToWeightMap(medals);

    expect(result.size).toBe(0);
  });
});

describe("getTeamMedalsMap", () => {
  it("aggregates medals from all players", () => {
    const teamData: MatchStatsData = {
      teamId: 1,
      teamStats: [],
      players: [
        {
          name: "Player1",
          values: [],
          medals: [
            { name: "Killing Spree", count: 2, sortingWeight: 100 },
            { name: "Double Kill", count: 3, sortingWeight: 50 },
          ],
        },
        {
          name: "Player2",
          values: [],
          medals: [
            { name: "Triple Kill", count: 1, sortingWeight: 75 },
            { name: "Double Kill", count: 2, sortingWeight: 50 },
          ],
        },
      ],
      teamMedals: [],
    };

    const result = getTeamMedalsMap(teamData);

    expect(result.get(100)).toBe(2);
    expect(result.get(75)).toBe(1);
    expect(result.get(50)).toBe(5);
  });

  it("handles team with no players", () => {
    const teamData: MatchStatsData = {
      teamId: 1,
      teamStats: [],
      players: [],
      teamMedals: [],
    };

    const result = getTeamMedalsMap(teamData);

    expect(result.size).toBe(0);
  });
});

describe("getPlayerMedalsMap", () => {
  it("returns medals map for player", () => {
    const playerData: { player: MatchStatsPlayerData } = {
      player: {
        name: "Player1",
        values: [],
        medals: [
          { name: "Killing Spree", count: 2, sortingWeight: 100 },
          { name: "Double Kill", count: 3, sortingWeight: 50 },
        ],
      },
    };

    const result = getPlayerMedalsMap(playerData);

    expect(result.get(100)).toBe(2);
    expect(result.get(50)).toBe(3);
  });
});

describe("sortByMedals", () => {
  function createMockRow<TData>(medals: Map<number, number>): Row<TData> {
    return {
      getValue: (columnId: string) => {
        void columnId;
        return medals as unknown;
      },
    } as Row<TData>;
  }

  it("sorts by highest weight first", () => {
    const rowA = createMockRow(new Map([[50, 5]]));
    const rowB = createMockRow(new Map([[100, 3]]));

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(-1);
  });

  it("sorts by count when weights are equal", () => {
    const rowA = createMockRow(new Map([[100, 2]]));
    const rowB = createMockRow(new Map([[100, 5]]));

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(-1);
  });

  it("returns 0 when both have no medals", () => {
    const rowA = createMockRow(new Map());
    const rowB = createMockRow(new Map());

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(0);
  });

  it("ranks rows with medals higher than rows without", () => {
    const rowA = createMockRow(new Map());
    const rowB = createMockRow(new Map([[100, 1]]));

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(-1);
  });

  it("compares multiple medal weights in order", () => {
    const rowA = createMockRow(
      new Map([
        [100, 2],
        [50, 3],
      ]),
    );
    const rowB = createMockRow(
      new Map([
        [100, 2],
        [75, 1],
      ]),
    );

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(1);
  });

  it("returns 0 when medals are equal", () => {
    const rowA = createMockRow(new Map([[100, 2]]));
    const rowB = createMockRow(new Map([[100, 2]]));

    const result = sortByMedals(rowA, rowB, "medals");

    expect(result).toBe(0);
  });
});
