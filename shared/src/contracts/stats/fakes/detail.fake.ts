import { GameVariantCategory } from "halo-infinite-api";
import type {
  CondensedMatchDetail,
  CondensedSeriesPlayer,
  CondensedSeriesTeam,
  MatchDetailResponse,
  SeriesDetailResponse,
} from "../detail";
import {
  aFakeCondensedMedalWith,
  aFakeCondensedPlayerWith,
  aFakeCondensedStatWith,
  aFakeCondensedTeamWith,
} from "./detail-primitives.fake";

export function aFakeCondensedMatchDetailWith(overrides: Partial<CondensedMatchDetail> = {}): CondensedMatchDetail {
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
    teams: [aFakeCondensedTeamWith()],
    players: [aFakeCondensedPlayerWith()],
    ...overrides,
  };
}

export function aFakeMatchDetailResponseWith(overrides: Partial<MatchDetailResponse> = {}): MatchDetailResponse {
  const detail = aFakeCondensedMatchDetailWith();
  return {
    matchIds: [detail.matchId],
    results: [{ status: "resolved", matchId: detail.matchId, detail }],
    ...overrides,
  };
}

export function aFakeCondensedSeriesPlayerWith(overrides: Partial<CondensedSeriesPlayer> = {}): CondensedSeriesPlayer {
  return {
    playerId: "xuid(1234567890)",
    xuid: "1234567890",
    gamertag: "Spartan One",
    playerType: 1,
    gamesPlayed: 2,
    stats: [aFakeCondensedStatWith({ value: 24 })],
    medals: [aFakeCondensedMedalWith({ count: 4 })],
    teamStats: [
      {
        seriesTeamId: 0,
        gamesPlayed: 2,
        stats: [aFakeCondensedStatWith({ value: 24 })],
        medals: [aFakeCondensedMedalWith({ count: 4 })],
      },
    ],
    ...overrides,
  };
}

export function aFakeCondensedSeriesTeamWith(overrides: Partial<CondensedSeriesTeam> = {}): CondensedSeriesTeam {
  return {
    seriesTeamId: 0,
    name: "Eagle",
    outcome: "Win",
    gamesPlayed: 2,
    gamesWon: 2,
    playerIds: ["xuid(1234567890)"],
    stats: [aFakeCondensedStatWith({ value: 24 })],
    medals: [aFakeCondensedMedalWith({ count: 4 })],
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
      teams: [aFakeCondensedSeriesTeamWith()],
      players: [aFakeCondensedSeriesPlayerWith()],
    },
    ...overrides,
  };
}
