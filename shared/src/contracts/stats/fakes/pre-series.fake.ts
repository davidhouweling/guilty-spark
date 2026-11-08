import type { LivePreSeriesPlayer, LivePreSeriesResponse } from "../pre-series";

export function aFakeLivePreSeriesPlayerWith(overrides: Partial<LivePreSeriesPlayer> = {}): LivePreSeriesPlayer {
  return {
    playerId: "player-1",
    teamIndex: 0,
    rosterJoinedAt: "2026-01-01T00:00:00.000Z",
    captured: {
      discordId: "player-1",
      discordName: "Player One",
      xboxId: "123",
      gamertag: "Player One",
      currentRank: 1500,
      currentRankTier: "Onyx",
      currentRankSubTier: 1,
      currentRankMeasurementMatchesRemaining: 0,
      currentRankInitialMeasurementMatches: 5,
      allTimePeakRank: 1700,
      esra: 1550,
      lastRankedGamePlayed: "2025-12-31T00:00:00.000Z",
    },
    ...overrides,
  };
}

export function aFakeLivePreSeriesResponseWith(
  overrides: Partial<Extract<LivePreSeriesResponse, { status: "resolved" }>> = {},
): LivePreSeriesResponse {
  return {
    status: "resolved",
    guildId: "123456789",
    queueNumber: 42,
    trackerStatus: "active",
    seriesStartedAt: "2026-01-01T00:00:00.000Z",
    rosterRevision: "roster-1",
    players: [aFakeLivePreSeriesPlayerWith()],
    ...overrides,
  };
}
