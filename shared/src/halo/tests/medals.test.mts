import { describe, it, expect } from "vitest";
import { aggregateTeamMedals } from "../medals.mjs";

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
