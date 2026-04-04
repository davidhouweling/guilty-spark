import { describe, it, expect, vi } from "vitest";
import { aggregateTeamMedals, getMedalMetadataFromMatches } from "../medals";
describe("getMedalMetadataFromMatches", () => {
  it("collects unique medal metadata from team and player stats", async () => {
    const rawMatches = {
      first: {
        Teams: [
          {
            Stats: {
              CoreStats: {
                Medals: [{ NameId: 1 }, { NameId: 2 }],
              },
            },
          },
        ],
        Players: [
          {
            PlayerTeamStats: [
              {
                Stats: {
                  CoreStats: {
                    Medals: [{ NameId: 2 }, { NameId: 3 }],
                  },
                },
              },
            ],
          },
        ],
      },
      second: {
        Teams: [
          {
            Stats: {
              CoreStats: {
                Medals: [{ NameId: 3 }, { NameId: 4 }],
              },
            },
          },
        ],
        Players: [],
      },
    };

    const getMedal = vi.fn(async (medalId: number) =>
      Promise.resolve({
        name: `Medal ${medalId.toString()}`,
        sortingWeight: medalId * 10,
      }),
    );

    const result = await getMedalMetadataFromMatches(rawMatches, getMedal);

    expect(getMedal).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      1: { name: "Medal 1", sortingWeight: 10 },
      2: { name: "Medal 2", sortingWeight: 20 },
      3: { name: "Medal 3", sortingWeight: 30 },
      4: { name: "Medal 4", sortingWeight: 40 },
    });
  });

  it("skips medals that cannot be resolved", async () => {
    const rawMatches = {
      first: {
        Teams: [
          {
            Stats: {
              CoreStats: {
                Medals: [{ NameId: 1 }, { NameId: 2 }],
              },
            },
          },
        ],
        Players: [],
      },
    };

    const getMedal = vi.fn(async (medalId: number) => {
      if (medalId === 2) {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        name: `Medal ${medalId.toString()}`,
        sortingWeight: medalId * 10,
      });
    });

    const result = await getMedalMetadataFromMatches(rawMatches, getMedal);

    expect(result).toEqual({
      1: { name: "Medal 1", sortingWeight: 10 },
    });
  });
});

describe("aggregateTeamMedals", () => {
  it("aggregates medals from all players", () => {
    const players = [
      {
        medals: [
          { name: "Killing Spree", count: 2, sortingWeight: 100 },
          { name: "Double Kill", count: 3, sortingWeight: 50 },
        ],
      },
      {
        medals: [
          { name: "Killing Spree", count: 1, sortingWeight: 100 },
          { name: "Triple Kill", count: 2, sortingWeight: 75 },
        ],
      },
    ];

    const result = aggregateTeamMedals(players);

    expect(result).toHaveLength(3);
    const killingSpree = result.find((m) => m.name === "Killing Spree");
    expect(killingSpree?.count).toBe(3);
  });

  it("sorts medals by sorting weight descending", () => {
    const players = [
      {
        medals: [
          { name: "Double Kill", count: 3, sortingWeight: 50 },
          { name: "Killing Spree", count: 2, sortingWeight: 100 },
          { name: "Triple Kill", count: 1, sortingWeight: 75 },
        ],
      },
    ];

    const result = aggregateTeamMedals(players);

    expect(result[0]?.name).toBe("Killing Spree");
    expect(result[1]?.name).toBe("Triple Kill");
    expect(result[2]?.name).toBe("Double Kill");
  });
});
