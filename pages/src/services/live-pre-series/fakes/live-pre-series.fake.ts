import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import type { LivePreSeriesService } from "../types";

type Resolved = Extract<LivePreSeriesResponse, { status: "resolved" }>;

export function aFakeLivePreSeriesResponseWith(overrides: Partial<Resolved> = {}): Resolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7,
    trackerStatus: "active",
    seriesStartedAt: "2026-11-06T00:00:00.000Z",
    rosterRevision: "roster-1",
    players: Array.from({ length: 8 }, (_, index) => ({
      playerId: (index + 1).toString(),
      teamIndex: index < 4 ? 0 : 1,
      rosterJoinedAt: "2026-11-06T00:00:00.000Z",
      captured: {
        discordId: (index + 1).toString(),
        discordName: `Player ${index.toString()}`,
        xboxId: null,
        gamertag: null,
        currentRank: 1500,
        currentRankTier: "Onyx",
        currentRankSubTier: null,
        currentRankMeasurementMatchesRemaining: null,
        currentRankInitialMeasurementMatches: null,
        allTimePeakRank: 1600,
        esra: 1550,
        lastRankedGamePlayed: null,
      },
    })),
    ...overrides,
  };
}

export function aFakeLivePreSeriesServiceWith(
  response: LivePreSeriesResponse = aFakeLivePreSeriesResponseWith(),
): LivePreSeriesService {
  return { getCapturedRoster: async () => Promise.resolve(response) };
}
