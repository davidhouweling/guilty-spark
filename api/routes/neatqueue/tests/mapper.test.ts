import { describe, expect, it } from "vitest";
import type { ActiveSeriesForPlayer } from "../../../services/neatqueue/types";
import { toActiveSeriesSummary } from "../mapper";

describe("toActiveSeriesSummary()", () => {
  it("omits discordId/discordName while keeping gamertag/xboxId", () => {
    const entry: ActiveSeriesForPlayer = {
      guildId: "guild-1",
      queueNumber: 5,
      seriesContext: {
        type: "started",
        title: "Test Server",
        subtitle: "Queue #5",
        guildIconUrl: null,
        startedAt: "2026-08-01T10:00:00.000Z",
        teams: [
          {
            id: 0,
            name: "Team A",
            players: [
              {
                discordId: "discord-1",
                discordName: "Chief#1234",
                gamertag: "Chief",
                xboxId: "xuid-1",
                currentRank: null,
                currentRankTier: null,
                currentRankSubTier: null,
                currentRankMeasurementMatchesRemaining: null,
                currentRankInitialMeasurementMatches: null,
                allTimePeakRank: null,
                esra: null,
                lastRankedGamePlayed: null,
              },
            ],
          },
        ],
      },
    };

    const result = toActiveSeriesSummary(entry);

    expect(result).toEqual({
      guildId: "guild-1",
      queueNumber: 5,
      title: "Test Server",
      subtitle: "Queue #5",
      guildIconUrl: null,
      startedAt: "2026-08-01T10:00:00.000Z",
      teams: [{ id: 0, name: "Team A", players: [{ gamertag: "Chief", xboxId: "xuid-1" }] }],
    });
  });

  it("omits startedAt from the summary when the series context has none", () => {
    const entry: ActiveSeriesForPlayer = {
      guildId: "guild-1",
      queueNumber: 5,
      seriesContext: {
        type: "started",
        title: "Test Server",
        subtitle: "Queue #5",
        guildIconUrl: null,
        teams: [],
      },
    };

    const result = toActiveSeriesSummary(entry);

    expect(result).not.toHaveProperty("startedAt");
  });
});
