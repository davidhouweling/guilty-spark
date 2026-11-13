import { describe, expect, it } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetail, MatchDetailResult, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeCoreStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { getMatchStats } from "../fakes/data";
import { aFakeSeriesDetailMatchWith } from "../fakes/series-detail.fake";
import { mapMatchDetail } from "../match-detail";
import { mapSeriesDetail } from "../series-detail";
import type { SeriesDetailOptions } from "../types";

function resolved(match: MatchStats): MatchDetailResult {
  return {
    status: "resolved",
    matchId: match.MatchId,
    detail: mapMatchDetail(match, { mapName: null, modeName: null, mapThumbnailUrl: null }),
  };
}

function detailAt(response: SeriesDetailResponse, index: number): MatchDetail {
  const result = Preconditions.checkExists(response.matches.results[index]);
  if (result.status !== "resolved") {
    throw new Error("Expected resolved match");
  }
  return result.detail;
}

function aggregate(
  response: SeriesDetailResponse,
): Extract<SeriesDetailResponse["aggregation"], { status: "resolved" }> {
  if (response.aggregation.status !== "resolved") {
    throw new Error("Expected resolved aggregation");
  }
  return response.aggregation;
}

function assemble(matches: MatchStats[], options: SeriesDetailOptions = {}): SeriesDetailResponse {
  return mapSeriesDetail(
    "series",
    matches.map((match) => match.MatchId),
    matches.map(resolved),
    matches,
    options,
  );
}

describe("aFakeSeriesDetailMatchWith", () => {
  it.each([
    { index: 9, hour: "2024-01-01T09" },
    { index: 10, hour: "2024-01-01T10" },
    { index: 23, hour: "2024-01-01T23" },
    { index: 24, hour: "2024-01-02T00" },
    { index: 29, hour: "2024-01-02T05" },
  ])("returns valid detail timestamps for index $index", ({ index, hour }) => {
    const match = aFakeSeriesDetailMatchWith(index);
    expect(match.MatchInfo.StartTime).toBe(`${hour}:00:00.000Z`);
    expect(match.MatchInfo.EndTime).toBe(`${hour}:10:00.000Z`);
    const detail = detailAt(assemble([match]), 0);
    expect(detail.startTime).toBe(match.MatchInfo.StartTime);
    expect(detail.endTime).toBe(match.MatchInfo.EndTime);
  });
});

describe("series detail identity validation", () => {
  it("rejects a resolved match missing from raw inputs beyond the first batch", () => {
    const matches = Array.from({ length: 31 }, (_, index) => aFakeSeriesDetailMatchWith(index, index !== 0));
    expect(() =>
      mapSeriesDetail(
        "series",
        matches.map((match) => match.MatchId),
        matches.map(resolved),
        matches.slice(0, 30),
      ),
    ).toThrow("Raw matches must cover exactly the distinct resolved match IDs");
  });

  it.each(["teams", "players"])("rejects duplicate %s identities that omit a raw identity", (field) => {
    const match = aFakeSeriesDetailMatchWith(1);
    const result = resolved(match);
    if (result.status !== "resolved") {
      throw new Error("Expected resolved detail");
    }
    const { detail } = result;
    if (field === "teams") {
      detail.teams[1] = Preconditions.checkExists(detail.teams[0]);
    } else {
      detail.players[1] = Preconditions.checkExists(detail.players[0]);
    }
    expect(() => mapSeriesDetail("series", [match.MatchId], [result], [match])).toThrow(
      "Raw match roster identities must match the per-game detail",
    );
  });
});

describe("mapSeriesDetail", () => {
  it("retains both numeric Oddball score sections from a real raw fixture", () => {
    const match = Preconditions.checkExists(getMatchStats("cf0fb794-2df1-4ba1-9415-00000oddball"));
    const response = assemble([match]);
    const detail = detailAt(response, 0);
    expect(detail.score.primary?.metric).toBe("rounds-won");
    expect(detail.score.secondary?.metric).toBe("score");
    expect(detail.score.primary?.teams.map((team) => team.value)).toEqual(
      match.Teams.map((team) => team.Stats.CoreStats.RoundsWon),
    );
    expect(detail.score.secondary?.teams.map((team) => team.value)).toEqual(
      match.Teams.map((team) => team.Stats.CoreStats.Score),
    );
    expect(detail.score.secondary?.teams.map((team) => team.seriesTeamId)).toEqual(
      match.Teams.map((team) => team.TeamId),
    );
    expect(aggregate(response).gamesPlayed).toBe(1);
  });
  it("uses chronological exact anchors and actual IDs while preserving caller order and raw details", () => {
    const anchor = aFakeSeriesDetailMatchWith(0);
    const swapped = aFakeSeriesDetailMatchWith(1, true);
    const matches = [swapped, anchor];
    const originalMatches = structuredClone(matches);
    const results = matches.map(resolved);
    const originalResults = structuredClone(results);
    const response = mapSeriesDetail("series", ["match-1", "match-0"], results, matches);
    const detail = detailAt(response, 0);
    expect(response.matches.matchIds).toEqual(["match-1", "match-0"]);
    expect(detail.teams.map((team) => [team.matchTeamId, team.seriesTeamId])).toEqual([
      [7, 3],
      [3, 7],
    ]);
    expect(detail.score.primary?.teams).toEqual([
      { matchTeamId: 7, seriesTeamId: 3, value: 50 },
      { matchTeamId: 3, seriesTeamId: 7, value: 40 },
    ]);
    expect(detail.players.map((player) => player.teamStats.map((row) => [row.matchTeamId, row.seriesTeamId]))).toEqual([
      [[7, 3]],
      [[7, 3]],
      [[3, 7]],
      [[3, 7]],
    ]);
    expect(detail.players.map((player) => player.lastMatchTeamId)).toEqual([7, 7, 3, 3]);
    expect(aggregate(response)).toMatchObject({
      gamesPlayed: 2,
      completedGameCount: 2,
      teams: [
        { seriesTeamId: 3, gamesWon: 0 },
        { seriesTeamId: 7, gamesWon: 2 },
      ],
    });
    expect(matches).toEqual(originalMatches);
    expect(results).toEqual(originalResults);
    expect(detail.teams[0]?.stats).toEqual(
      mapMatchDetail(swapped, {
        mapName: null,
        modeName: null,
        mapThumbnailUrl: null,
      }).teams[0]?.stats,
    );
    expect(seriesDetailContract.parse(response)).toEqual(response);
    const json = JSON.stringify(response);
    expect(json).not.toContain("CoreStats");
    expect(json).not.toContain("rawMatch");
    expect(json).not.toContain("PlayerTeamStats");
  });

  it("allows substitutions only with explicit source manual status", () => {
    const matches = [aFakeSeriesDetailMatchWith(0), aFakeSeriesDetailMatchWith(1, true, true)];
    expect(assemble(matches).aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
    const response = assemble(matches, { isManualSeries: true });
    expect(detailAt(response, 1).teams.map((team) => team.seriesTeamId)).toEqual([3, 7]);
    expect(aggregate(response).players.find((player) => player.playerId === "0900000000000000")).toMatchObject({
      gamesPlayed: 1,
      teamStats: [{ seriesTeamId: 7, gamesPlayed: 1 }],
    });
    expect(aggregate(response).players.find((player) => player.playerId === "0200000000000000")?.gamesPlayed).toBe(1);
  });

  it("preserves duplicates in the response without duplicating aggregate counts", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const response = mapSeriesDetail(
      "series",
      [match.MatchId, match.MatchId],
      [resolved(match), resolved(match)],
      [match],
    );
    expect(response.matches.results).toHaveLength(2);
    expect(aggregate(response).gamesPlayed).toBe(1);
    expect(aggregate(response).players.map((player) => player.gamesPlayed)).toEqual([1, 1, 1, 1]);
  });

  it("preserves partial failures and duplicate order without success-shaped totals", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const missing: MatchDetailResult = { status: "unavailable", matchId: "missing", reason: "not-found" };
    const response = mapSeriesDetail(
      "series",
      ["missing", match.MatchId, "missing"],
      [missing, resolved(match), missing],
      [match],
    );
    expect(response.aggregation).toEqual({ status: "unavailable", reason: "incomplete-matches" });
    expect(response.matches.results[0]).toEqual(missing);
    expect(response.matches.results[2]).toEqual(missing);
    expect(detailAt(response, 1).teams.map((team) => team.seriesTeamId)).toEqual([7, 3]);
  });

  it("makes all series mappings null for crossed rosters with changed nonsequential IDs", () => {
    const anchor = aFakeSeriesDetailMatchWith(0);
    const later = aFakeSeriesDetailMatchWith(1);
    later.Players[0] = { ...Preconditions.checkExists(later.Players[0]), PlayerId: "0400000000000000" };
    later.Players[2] = { ...Preconditions.checkExists(later.Players[2]), PlayerId: "0100000000000000" };
    const changed = {
      ...later,
      Teams: later.Teams.map((team) => ({ ...team, TeamId: team.TeamId + 10 })),
      Players: later.Players.map((player) => ({
        ...player,
        LastTeamId: player.LastTeamId + 10,
        PlayerTeamStats: player.PlayerTeamStats.map((stats) => ({ ...stats, TeamId: stats.TeamId + 10 })),
      })),
    };
    const response = assemble([anchor, changed]);
    expect(response.aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
    expect(detailAt(response, 0).teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
    expect(detailAt(response, 1).score.primary?.teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
    expect(
      detailAt(response, 1).players.flatMap((player) => player.teamStats.map((stats) => stats.seriesTeamId)),
    ).toEqual([null, null, null, null]);
  });

  it("leaves one-team and unknown-team matches explicitly unresolved", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const oneTeam = {
      ...match,
      Teams: [Preconditions.checkExists(match.Teams[0])],
      Players: match.Players.slice(0, 2),
    };
    expect(assemble([oneTeam]).aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
    const unknownTeam = { ...match, Players: match.Players.map((player) => ({ ...player, LastTeamId: 99 })) };
    expect(assemble([unknownTeam]).aggregation).toEqual({ status: "unavailable", reason: "ambiguous-team-mapping" });
  });

  it("rejects extra, duplicate, missing or incorrectly identified raw input and unordered results", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const other = aFakeSeriesDetailMatchWith(1);
    expect(() => mapSeriesDetail("series", [match.MatchId], [resolved(match)], [])).toThrow("Raw matches");
    expect(() => mapSeriesDetail("series", [match.MatchId], [resolved(match)], [other])).toThrow("Raw matches");
    expect(() => mapSeriesDetail("series", [match.MatchId], [resolved(match)], [match, other])).toThrow("Raw matches");
    expect(() => mapSeriesDetail("series", [match.MatchId], [resolved(match)], [match, match])).toThrow("Raw matches");
    expect(() =>
      mapSeriesDetail("series", [match.MatchId, other.MatchId], [resolved(other), resolved(match)], [match, other]),
    ).toThrow();
    expect(() =>
      mapSeriesDetail(
        "series",
        [match.MatchId],
        [resolved(match)],
        [{ ...other, MatchId: match.MatchId, Players: [] }],
      ),
    ).toThrow("Raw match roster");
  });

  it("propagates malformed aggregation computation instead of returning aggregation-failed", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const result = resolved(match);
    const malformed = {
      ...match,
      Teams: match.Teams.map((team) => ({
        ...team,
        Stats: { CoreStats: aFakeCoreStatsWith({ Kills: Number.NaN }) },
      })),
    };
    expect(() => mapSeriesDetail("series", [match.MatchId], [result], [malformed])).toThrow();
  });

  it("retains nullable context metadata without fabricating source information", () => {
    const match = aFakeSeriesDetailMatchWith(0);
    const response = assemble([match], { context: { title: "Manual series", subtitle: null }, isManualSeries: false });
    expect(response.context).toEqual({ title: "Manual series", subtitle: null });
    expect(assemble([match]).context).toBeUndefined();
    const unavailable: MatchDetailResult = { status: "unavailable", matchId: "missing", reason: "forbidden" };
    expect(mapSeriesDetail("series", ["missing"], [unavailable], []).aggregation).toEqual({
      status: "unavailable",
      reason: "incomplete-matches",
    });
  });
});
