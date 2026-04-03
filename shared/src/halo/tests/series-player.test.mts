import { describe, it, expect } from "vitest";
import { aggregatePlayerCoreStats } from "../series-player.mjs";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "../fakes/data.mjs";

describe("aggregatePlayerCoreStats", () => {
  it("aggregates stats across multiple matches", () => {
    const match1 = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 5 }),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
      ],
    });
    const match2 = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 15, Deaths: 8 }),
                PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
              },
            },
          ],
        }),
      ],
    });

    const result = aggregatePlayerCoreStats([match1, match2]);

    const playerStats = result.get("xuid(1111)");
    expect(playerStats?.Kills).toBe(25);
    expect(playerStats?.Deaths).toBe(13);
  });

  it("adjusts averages after aggregation", () => {
    const match1 = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Accuracy: 50 }),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
      ],
    });
    const match2 = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Accuracy: 60 }),
                PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
              },
            },
          ],
        }),
      ],
    });

    const result = aggregatePlayerCoreStats([match1, match2]);

    const playerStats = result.get("xuid(1111)");
    expect(playerStats?.Accuracy).toBe(55);
  });
});
