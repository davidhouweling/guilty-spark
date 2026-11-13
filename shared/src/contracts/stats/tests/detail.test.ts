import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { aFakeMatchStatsWith } from "../../../halo/fakes/data";
import {
  aFakeMatchDetailWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesTeamWith,
  aFakeMatchDetailResponseWith,
  aFakeSeriesDetailResponseWith,
} from "../fakes/detail.fake";
import { aFakePlayerWith, aFakeTeamWith } from "../fakes/detail-primitives.fake";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  matchDetailSchema,
  seriesPlayerSchema,
  seriesTeamSchema,
  matchDetailContract,
  matchDetailQuerySchema,
  seriesDetailContract,
  seriesDetailParamsSchema,
} from "@guilty-spark/shared/contracts/stats/detail";

describe("series detail parameters", () => {
  it("requires a nonempty series identifier", () => {
    expect(seriesDetailParamsSchema.parse({ seriesId: "selected" })).toEqual({ seriesId: "selected" });
    expect(seriesDetailParamsSchema.safeParse({ seriesId: "" }).success).toBe(false);
    expect(seriesDetailParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe("match details", () => {
  it("round trips numerical duration, chronological metadata and optional planned-map index", async () => {
    const detail = aFakeMatchDetailWith({ plannedMapIndex: 3 });
    const batch = aFakeMatchDetailResponseWith({ results: [{ status: "resolved", matchId: detail.matchId, detail }] });
    expect(await matchDetailContract.fromResponse(matchDetailContract.toResponse(batch))).toEqual(batch);
    expect(detail.durationSeconds).toBe(525.5042357);
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite duration and score (%s)", (value) => {
    expect(matchDetailSchema.safeParse(aFakeMatchDetailWith({ durationSeconds: value })).success).toBe(false);
    const score = {
      primary: { metric: "score", teams: [{ matchTeamId: 7, seriesTeamId: 0, value }] },
      secondary: null,
    };
    expect(matchDetailSchema.safeParse({ ...aFakeMatchDetailWith(), score }).success).toBe(false);
  });

  it("rejects negative duration, invalid timestamps, reversed chronology and incorrect team counts", () => {
    const detail = aFakeMatchDetailWith();
    expect(matchDetailSchema.safeParse({ ...detail, durationSeconds: -1 }).success).toBe(false);
    expect(matchDetailSchema.safeParse({ ...detail, startTime: "yesterday" }).success).toBe(false);
    expect(
      matchDetailSchema.safeParse({ ...detail, endTime: detail.startTime, startTime: detail.endTime }).success,
    ).toBe(false);
    expect(matchDetailSchema.safeParse({ ...detail, teamCount: 2 }).success).toBe(false);
  });

  it("preserves Oddball rounds and points separately without parsing a formatted score", () => {
    const detail = aFakeMatchDetailWith({
      mode: {
        ...aFakeMatchDetailWith().mode,
        gameVariantCategory: GameVariantCategory.MultiplayerOddball,
        name: "Oddball",
      },
      score: {
        primary: { metric: "rounds-won", teams: [{ matchTeamId: 7, seriesTeamId: 0, value: 2 }] },
        secondary: { metric: "score", teams: [{ matchTeamId: 7, seriesTeamId: 0, value: 173.25 }] },
      },
    });
    expect(matchDetailSchema.parse(detail).score).toEqual(detail.score);
  });

  it("accepts zero teams, unknown modes and bot identities without fabricating scores or mappings", async () => {
    const detail = aFakeMatchDetailWith({
      teamCount: 0,
      teams: [],
      teamsEnabled: false,
      teamScoringEnabled: false,
      mode: { assetId: "unknown", versionId: "unknown-version", gameVariantCategory: -1, name: null },
      score: { primary: null, secondary: null },
      players: [aFakePlayerWith({ playerId: "bid(42)", xuid: undefined, lastMatchTeamId: null, teamStats: [] })],
    });
    const batch = aFakeMatchDetailResponseWith({ results: [{ status: "resolved", matchId: detail.matchId, detail }] });
    const parsed = await matchDetailContract.fromResponse(matchDetailContract.toResponse(batch));
    expect(parsed.results).toEqual(batch.results);
    expect(JSON.stringify(parsed)).not.toContain('"xuid"');
  });

  it("preserves original per-game team statistics and scores when series sides swap", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ matchTeamId: 19, seriesTeamId: 0, outcome: "Loss" })],
      score: {
        primary: { metric: "score", teams: [{ matchTeamId: 19, seriesTeamId: 0, value: 47 }] },
        secondary: null,
      },
      players: [
        aFakePlayerWith({
          lastMatchTeamId: 19,
          teamStats: [{ matchTeamId: 19, seriesTeamId: 0, stats: [], medals: [] }],
        }),
      ],
    });
    expect(matchDetailSchema.parse(detail)).toEqual(detail);
  });

  it("strips actual raw MatchStats and analytics at every response envelope boundary", async () => {
    const raw = aFakeMatchStatsWith();
    const detail = { ...aFakeMatchDetailWith(), ...raw, rawMatch: raw, analytics: raw };
    const response = {
      ...aFakeSeriesDetailResponseWith(),
      ...{ rawMatches: [raw] },
      matches: {
        matchIds: [detail.matchId],
        ...{ rawMatchStats: raw },
        results: [{ status: "resolved", matchId: detail.matchId, detail, ...{ seriesMatch: raw } }],
      },
    } satisfies SeriesDetailResponse;
    const parsed = await seriesDetailContract.fromResponse(seriesDetailContract.toResponse(response));
    expect(parsed.matches).toEqual(aFakeMatchDetailResponseWith());
    expect(parsed).not.toHaveProperty("rawMatches");
    expect(JSON.stringify(parsed)).not.toContain('"CoreStats"');
    expect(JSON.stringify(parsed)).not.toContain('"MatchInfo"');
  });
});

describe("bounded match detail batches", () => {
  it("retains duplicate requested IDs and mixed resolved/unavailable results in order", async () => {
    const detail = aFakeMatchDetailWith();
    const response = aFakeMatchDetailResponseWith({
      matchIds: ["missing", detail.matchId, "missing"],
      results: [
        { status: "unavailable", matchId: "missing", reason: "not-found" },
        { status: "resolved", matchId: detail.matchId, detail },
        { status: "unavailable", matchId: "missing", reason: "fetch-failed" },
      ],
    });
    expect(await matchDetailContract.fromResponse(matchDetailContract.toResponse(response))).toEqual(response);
  });

  it("rejects omitted, reordered and mismatched resolved identities", () => {
    const batch = aFakeMatchDetailResponseWith();
    expect(matchDetailContract.safeParse({ ...batch, results: [] }).success).toBe(false);
    expect(matchDetailContract.safeParse({ ...batch, matchIds: ["another"] }).success).toBe(false);
    expect(
      matchDetailContract.safeParse({
        ...batch,
        results: [{ status: "resolved", matchId: "match-one", detail: aFakeMatchDetailWith({ matchId: "other" }) }],
      }).success,
    ).toBe(false);
  });

  it("bounds requests and responses to 30 nonempty match IDs without silently dropping IDs", () => {
    expect(matchDetailQuerySchema.parse({ matchIds: " one ,two,one" }).matchIds).toEqual(["one", "two", "one"]);
    expect(matchDetailQuerySchema.safeParse({ matchIds: "" }).success).toBe(false);
    expect(matchDetailQuerySchema.safeParse({ matchIds: "one,,two" }).success).toBe(false);
    expect(matchDetailQuerySchema.safeParse({ matchIds: "a".repeat(129) }).success).toBe(false);
    expect(
      matchDetailQuerySchema.safeParse({ matchIds: Array.from({ length: 31 }, () => "one").join(",") }).success,
    ).toBe(false);
    const matchIds = Array.from({ length: 31 }, () => "one");
    expect(
      matchDetailContract.safeParse({
        matchIds,
        results: matchIds.map((matchId) => ({ status: "unavailable", matchId, reason: "forbidden" })),
      }).success,
    ).toBe(false);
  });
});

describe("backend series aggregation", () => {
  it.each([NaN, Infinity, -Infinity, -1, 1.5])("rejects invalid games played (%s)", (gamesPlayed) => {
    expect(seriesPlayerSchema.safeParse(aFakeSeriesPlayerWith({ gamesPlayed })).success).toBe(false);
    expect(seriesTeamSchema.safeParse(aFakeSeriesTeamWith({ gamesPlayed })).success).toBe(false);
  });

  it("preserves bot aggregate identity and stable numeric series IDs without a raw team requirement", () => {
    const player = aFakeSeriesPlayerWith({ playerId: "bid(42)", xuid: undefined, teamStats: [] });
    expect(seriesPlayerSchema.parse(player)).toEqual(player);
    expect(seriesTeamSchema.safeParse({ ...aFakeSeriesTeamWith(), seriesTeamId: "0" }).success).toBe(false);
  });

  it("round trips backend totals and games played independently of the loaded match subset", async () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 3,
        completedGameCount: 2,
        teams: [aFakeSeriesTeamWith({ seriesTeamId: 19, gamesPlayed: 3, gamesWon: 2 })],
        players: [
          aFakeSeriesPlayerWith({
            gamesPlayed: 2,
            teamStats: [{ seriesTeamId: 19, gamesPlayed: 2, stats: [], medals: [] }],
          }),
        ],
      },
    });
    expect(await seriesDetailContract.fromResponse(seriesDetailContract.toResponse(response))).toEqual(response);
    expect(response.matches.results).toHaveLength(1);
  });

  it("strips match team identity and participation from independent aggregate players and teams", async () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 2,
        completedGameCount: 1,
        teams: [{ ...aFakeTeamWith(), ...aFakeSeriesTeamWith() }],
        players: [{ ...aFakePlayerWith(), ...aFakeSeriesPlayerWith() }],
      },
    });
    const parsed = await seriesDetailContract.fromResponse(seriesDetailContract.toResponse(response));
    expect(parsed.aggregation).toEqual(aFakeSeriesDetailResponseWith().aggregation);
    expect(JSON.stringify(parsed.aggregation)).not.toContain("matchTeamId");
    expect(JSON.stringify(parsed.aggregation)).not.toContain("participation");
  });

  it("keeps unavailable aggregation explicit without success-shaped fallback totals", async () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });
    const parsed = await seriesDetailContract.fromResponse(seriesDetailContract.toResponse(response));
    expect(parsed.aggregation).toEqual(response.aggregation);
    expect(parsed.aggregation).not.toHaveProperty("gamesPlayed");
    expect(parsed).not.toHaveProperty("context");
  });

  it("includes existing live planned-map metadata only when applicable", async () => {
    const response = aFakeSeriesDetailResponseWith({
      context: { title: "Queue #42", subtitle: null, plannedMaps: [{ mode: "Slayer", map: "Live Fire" }] },
    });
    expect(await seriesDetailContract.fromResponse(seriesDetailContract.toResponse(response))).toEqual(response);
    expect(
      seriesDetailContract.safeParse({
        ...response,
        context: { ...response.context, plannedMaps: [{ mode: "", map: "Live Fire" }] },
      }).success,
    ).toBe(false);
  });
});
