import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeStatWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";

function matchWith(swapped: boolean): MatchDetail {
  const assignments = [
    { xuid: "111", gamertag: "Alpha", matchTeamId: 7, seriesTeamId: swapped ? 1 : 0 },
    { xuid: "222", gamertag: "Bravo", matchTeamId: 19, seriesTeamId: swapped ? 0 : 1 },
    { xuid: "333", gamertag: "Charlie", matchTeamId: swapped ? 7 : 19, seriesTeamId: 1 },
  ];
  return aFakeMatchDetailWith({
    matchId: swapped ? "match-two" : "match-one",
    startTime: swapped ? "2024-11-26T12:00:00Z" : "2024-11-26T11:00:00Z",
    endTime: swapped ? "2024-11-26T12:10:00Z" : "2024-11-26T11:10:00Z",
    teamCount: 2,
    teams: [0, 1].map((seriesTeamId) => {
      const members = assignments.filter((player) => player.seriesTeamId === seriesTeamId);
      return aFakeTeamWith({
        matchTeamId: seriesTeamId === (swapped ? 1 : 0) ? 7 : 19,
        seriesTeamId,
        name: seriesTeamId === 0 ? "Eagle" : "Cobra",
        playerIds: members.map(({ xuid }) => `xuid(${xuid})`),
      });
    }),
    players: assignments.map(({ xuid, gamertag, matchTeamId, seriesTeamId }) =>
      aFakePlayerWith({
        playerId: `xuid(${xuid})`,
        xuid,
        gamertag,
        lastMatchTeamId: matchTeamId,
        teamStats: [aFakePlayerTeamStatsWith({ matchTeamId, seriesTeamId })],
      }),
    ),
  });
}

export function aFakeSeriesDetailWithTeamSwap(): SeriesDetailResponse {
  const first = matchWith(false);
  const last = matchWith(true);
  return aFakeSeriesDetailResponseWith({
    matches: {
      matchIds: [last.matchId, first.matchId],
      results: [
        { status: "resolved", matchId: last.matchId, detail: last },
        { status: "resolved", matchId: first.matchId, detail: first },
      ],
    },
    aggregation: {
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 2,
      teams: [
        aFakeSeriesTeamWith({
          seriesTeamId: 0,
          name: "Eagle",
          playerIds: ["xuid(111)", "xuid(222)"],
          stats: [aFakeStatWith({ value: 12 })],
        }),
        aFakeSeriesTeamWith({
          seriesTeamId: 1,
          name: "Cobra",
          playerIds: ["xuid(222)", "xuid(333)", "xuid(111)"],
          stats: [aFakeStatWith({ value: 18 })],
        }),
      ],
      players: ["111", "222", "333"].map((xuid, index) =>
        aFakeSeriesPlayerWith({
          playerId: `xuid(${xuid})`,
          xuid,
          gamertag: ["Alpha", "Bravo", "Charlie"][index],
          teamStats: (xuid === "333" ? [1] : [0, 1]).map((seriesTeamId) => ({
            seriesTeamId,
            gamesPlayed: xuid === "333" ? 2 : 1,
            stats: [aFakeStatWith({ value: seriesTeamId === 0 ? 5 : 8 })],
            medals: [],
          })),
        }),
      ),
    },
  });
}
