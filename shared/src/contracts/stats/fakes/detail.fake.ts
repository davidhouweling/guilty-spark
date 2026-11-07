import { GameVariantCategory } from "halo-infinite-api";
import type { MatchDetail, SeriesPlayer, SeriesTeam, MatchDetailResponse, SeriesDetailResponse } from "../detail";
import { aFakeMedalWith, aFakePlayerWith, aFakeStatWith, aFakeTeamWith } from "./detail-primitives.fake";

export function aFakeMatchDetailWith(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    matchId: "match-one",
    startTime: "2024-11-26T11:05:39.587Z",
    endTime: "2024-11-26T11:14:25.091Z",
    durationSeconds: 525.5042357,
    map: { assetId: "map-one", versionId: "map-version", name: "Live Fire", thumbnailUrl: null },
    mode: {
      assetId: "mode-one",
      versionId: "mode-version",
      gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
      name: "Slayer",
    },
    isMatchmaking: false,
    matchmakingPlaylist: null,
    teamsEnabled: true,
    teamScoringEnabled: true,
    teamCount: 1,
    score: {
      primary: { metric: "score", teams: [{ matchTeamId: 7, seriesTeamId: 0, value: 50 }] },
      secondary: null,
    },
    teams: [aFakeTeamWith()],
    players: [aFakePlayerWith()],
    ...overrides,
  };
}

export function aFakeMatchDetailResponseWith(overrides: Partial<MatchDetailResponse> = {}): MatchDetailResponse {
  const detail = aFakeMatchDetailWith();
  return {
    matchIds: [detail.matchId],
    results: [{ status: "resolved", matchId: detail.matchId, detail }],
    ...overrides,
  };
}

export function aFakeSeriesPlayerWith(overrides: Partial<SeriesPlayer> = {}): SeriesPlayer {
  return {
    playerId: "xuid(1234567890)",
    xuid: "1234567890",
    gamertag: "Spartan One",
    playerType: 1,
    gamesPlayed: 2,
    stats: [aFakeStatWith({ value: 24 })],
    medals: [aFakeMedalWith({ count: 4 })],
    teamStats: [
      {
        seriesTeamId: 0,
        gamesPlayed: 2,
        stats: [aFakeStatWith({ value: 24 })],
        medals: [aFakeMedalWith({ count: 4 })],
      },
    ],
    ...overrides,
  };
}

export function aFakeSeriesTeamWith(overrides: Partial<SeriesTeam> = {}): SeriesTeam {
  return {
    seriesTeamId: 0,
    name: "Eagle",
    outcome: "Win",
    gamesPlayed: 2,
    gamesWon: 2,
    playerIds: ["xuid(1234567890)"],
    stats: [aFakeStatWith({ value: 24 })],
    medals: [aFakeMedalWith({ count: 4 })],
    ...overrides,
  };
}

export function aFakeSeriesDetailResponseWith(overrides: Partial<SeriesDetailResponse> = {}): SeriesDetailResponse {
  return {
    seriesId: "existing-series-id",
    matches: aFakeMatchDetailResponseWith(),
    aggregation: {
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 1,
      teams: [aFakeSeriesTeamWith()],
      players: [aFakeSeriesPlayerWith()],
    },
    ...overrides,
  };
}
