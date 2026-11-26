import { GameVariantCategory } from "halo-infinite-api";
import type { MatchDetail, SeriesPlayer, SeriesTeam, MatchDetailResponse, SeriesDetailResponse } from "../detail";
import {
  aFakeMedalWith,
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeStatWith,
  aFakeTeamWith,
} from "./detail-primitives.fake";

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
    teamCount: 2,
    score: {
      primary: {
        metric: "score",
        teams: [
          { matchTeamId: 7, seriesTeamId: 0, value: 50 },
          { matchTeamId: 19, seriesTeamId: 1, value: 40 },
        ],
      },
      secondary: null,
    },
    teams: [
      aFakeTeamWith(),
      aFakeTeamWith({
        matchTeamId: 19,
        seriesTeamId: 1,
        name: "Cobra",
        outcome: "Loss",
        rank: 2,
        playerIds: ["xuid(9876543210)"],
      }),
    ],
    players: [
      aFakePlayerWith(),
      aFakePlayerWith({
        playerId: "xuid(9876543210)",
        xuid: "9876543210",
        gamertag: "Spartan Two",
        lastMatchTeamId: 19,
        outcome: "Loss",
        rank: 2,
        teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 19, seriesTeamId: 1 })],
      }),
    ],
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
      gamesPlayed: 1,
      completedGameCount: 1,
      teams: [
        aFakeSeriesTeamWith({ gamesPlayed: 1, gamesWon: 1 }),
        aFakeSeriesTeamWith({
          seriesTeamId: 1,
          name: "Cobra",
          outcome: "Loss",
          gamesPlayed: 1,
          gamesWon: 0,
          playerIds: ["xuid(9876543210)"],
          stats: [aFakeStatWith({ value: 18 })],
          medals: [],
        }),
      ],
      players: [
        aFakeSeriesPlayerWith({
          gamesPlayed: 1,
          teamStats: [
            {
              seriesTeamId: 0,
              gamesPlayed: 1,
              stats: [aFakeStatWith({ value: 24 })],
              medals: [aFakeMedalWith({ count: 4 })],
            },
          ],
        }),
        aFakeSeriesPlayerWith({
          playerId: "xuid(9876543210)",
          xuid: "9876543210",
          gamertag: "Spartan Two",
          gamesPlayed: 1,
          stats: [aFakeStatWith({ value: 18 })],
          medals: [],
          teamStats: [
            {
              seriesTeamId: 1,
              gamesPlayed: 1,
              stats: [aFakeStatWith({ value: 18 })],
              medals: [],
            },
          ],
        }),
      ],
    },
    ...overrides,
  };
}
