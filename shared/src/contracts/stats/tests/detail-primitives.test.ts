import { describe, expect, it } from "vitest";
import {
  aFakeMedalWith,
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeStatWith,
  aFakeTeamWith,
} from "../fakes/detail-primitives.fake";
import { aFakeMatchStatsWith } from "../../../halo/fakes/data";
import { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import {
  medalSchema,
  playerContract,
  statSchema,
  teamContract,
  teamMappingSchema,
} from "@guilty-spark/shared/contracts/stats/detail-primitives";

describe("stat primitives", () => {
  it("preserves exact finite values and numeric sorting/formatting metadata", () => {
    const stat = aFakeStatWith({
      key: "core.averageLifeSeconds",
      name: "Avg life time",
      value: 12.3456789012345,
      sortBy: StatsValueSortBy.ASC,
      format: "duration-seconds",
      prefix: "Avg",
      isComparable: false,
    });
    expect(statSchema.parse(stat)).toEqual(stat);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite numeric values (%s)", (value) => {
    expect(statSchema.safeParse(aFakeStatWith({ value })).success).toBe(false);
  });

  it("rejects invented string sort directions and omitted numeric values", () => {
    expect(statSchema.safeParse({ ...aFakeStatWith(), sortBy: "desc" }).success).toBe(false);
    expect(statSchema.safeParse({ ...aFakeStatWith(), value: undefined }).success).toBe(false);
  });

  it.each(["number", "percentage", "duration-seconds", "ratio"])(
    "retains the %s numeric format without a pre-rendered display string",
    (format) => {
      const stat = statSchema.parse({ ...aFakeStatWith(), format, display: "rounded" });
      expect(stat.format).toBe(format);
      expect(stat).not.toHaveProperty("display");
    },
  );

  it("preserves unbounded ratios without serializing Infinity or inventing a finite default", () => {
    const stat = {
      ...aFakeStatWith(),
      status: "unbounded",
      format: "ratio",
      numerator: 4200.125,
      denominator: 0,
    };
    expect(statSchema.parse(stat)).toEqual({
      key: "Kills",
      name: "Kills",
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
      status: "unbounded",
      format: "ratio",
      numerator: 4200.125,
      denominator: 0,
    });
    expect(statSchema.safeParse({ ...stat, numerator: 0 }).success).toBe(false);
    expect(statSchema.safeParse({ ...stat, denominator: 1 }).success).toBe(false);
  });

  it("represents unavailable statistics without a fabricated zero", () => {
    const stat = statSchema.parse({ ...aFakeStatWith(), status: "unavailable" });
    expect(stat.status).toBe("unavailable");
    expect(stat).not.toHaveProperty("value");
  });
});

describe("player and team primitives", () => {
  it.each(["bid(1)", "bid(2)", "xuid(unresolved)", "unidentified-player"])(
    "round trips the raw stable player key %s without requiring Xbox or Discord identity",
    async (playerId) => {
      const player = aFakePlayerWith({ playerId, playerType: 2, xuid: undefined });
      const parsed = await playerContract.fromResponse(playerContract.toResponse(player, { noStore: true }));
      expect(parsed.playerId).toBe(playerId);
      expect(parsed).not.toHaveProperty("xuid");
      expect(parsed).not.toHaveProperty("discordUserId");
    },
  );

  it("retains normalized Xbox and applicable Discord identities without coercion", () => {
    const player = aFakePlayerWith({ discordUserId: "987654321098765432" });
    expect(playerContract.parse(player)).toEqual(player);
    expect(playerContract.safeParse({ ...player, xuid: "xuid(1234567890)" }).success).toBe(false);
    expect(playerContract.safeParse({ ...player, discordUserId: "bot" }).success).toBe(false);
  });

  it("keeps swapped nonsequential match IDs separate from stable series IDs", async () => {
    const teams = [
      aFakeTeamWith({ matchTeamId: 9, seriesTeamId: 0 }),
      aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 1 }),
    ];
    const roundTrips = await Promise.all(
      teams.map(async (team) => teamContract.fromResponse(teamContract.toResponse(team))),
    );
    expect(roundTrips.map(({ matchTeamId, seriesTeamId }) => ({ matchTeamId, seriesTeamId }))).toEqual([
      { matchTeamId: 9, seriesTeamId: 0 },
      { matchTeamId: 7, seriesTeamId: 1 },
    ]);
  });

  it("requires explicit null for ambiguous mapping and preserves player team segments", () => {
    const teamStats = [
      aFakePlayerTeamStatsWith({ matchTeamId: 9, seriesTeamId: null }),
      aFakePlayerTeamStatsWith({ matchTeamId: 7, seriesTeamId: 1 }),
    ];
    expect(playerContract.parse(aFakePlayerWith({ teamStats })).teamStats).toEqual(teamStats);
    expect(teamMappingSchema.parse({ matchTeamId: 9, seriesTeamId: null })).toEqual({
      matchTeamId: 9,
      seriesTeamId: null,
    });
    expect(teamMappingSchema.safeParse({ matchTeamId: 9 }).success).toBe(false);
  });

  it.each(["Win", "Loss", "Tie", "DNF", "Unknown"])("retains the %s outcome", (outcome) => {
    expect(teamContract.parse({ ...aFakeTeamWith(), outcome }).outcome).toBe(outcome);
  });

  it("accepts partial participation and unavailable details without fabricated rosters or ranks", () => {
    const player = aFakePlayerWith({
      gamertag: null,
      lastMatchTeamId: null,
      rank: null,
      outcome: "Unknown",
      participation: {
        presentAtBeginning: false,
        joinedInProgress: true,
        leftInProgress: true,
        presentAtCompletion: false,
      },
      teamStats: [],
    });
    expect(playerContract.parse(player)).toEqual(player);
    const team = aFakeTeamWith({
      seriesTeamId: null,
      name: null,
      rank: null,
      playerIds: [],
      stats: [],
      medals: [],
    });
    expect(teamContract.parse(team)).toEqual(team);
  });

  it("strips full raw stats and analytics at every serialized player nesting boundary", async () => {
    const player = aFakePlayerWith();
    const rawMatch = aFakeMatchStatsWith();
    const contaminated = {
      ...player,
      rawMatch,
      analytics: { rawMatch },
      teamStats: [
        {
          ...aFakePlayerTeamStatsWith(),
          Stats: rawMatch,
          stats: [{ ...aFakeStatWith(), rawMatch, CoreStats: rawMatch }],
          medals: [{ ...aFakeMedalWith(), rawMatch, mythic: true, points: 100 }],
        },
      ],
    };
    const response = playerContract.toResponse(contaminated);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const serialized = await response.text();
    expect(JSON.parse(serialized)).toEqual(player);
    expect(serialized).not.toMatch(/rawMatch|CoreStats|MatchInfo|BotAttributes|analytics|mythic|points/);
  });

  it("strips full raw stats at the team serialization boundary", async () => {
    const team = aFakeTeamWith();
    const contaminated = { ...team, rawMatch: aFakeMatchStatsWith() };
    const response = teamContract.toResponse(contaminated);
    expect(await teamContract.fromResponse(response)).toEqual(team);
  });

  it("retains raw bot roster keys rather than substituting Xbox IDs", () => {
    const team = aFakeTeamWith({ playerIds: ["bid(1)", "bid(2)", "xuid(unresolved)"] });
    expect(teamContract.parse(team).playerIds).toEqual(team.playerIds);
  });
});

describe("medal primitives", () => {
  it("preserves actual medal IDs, counts and metadata instead of mythic/points projections", () => {
    const medal = aFakeMedalWith({ id: 4294967295, count: 3, sortingWeight: 123.5 });
    expect(medalSchema.parse(medal)).toEqual(medal);
  });

  it("retains unknown medals with explicitly unavailable metadata", () => {
    const medal = aFakeMedalWith({
      name: null,
      sortingWeight: null,
      difficultyIndex: null,
      difficulty: null,
    });
    expect(medalSchema.parse(medal)).toEqual(medal);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite medal sorting weights (%s)", (sortingWeight) => {
    expect(medalSchema.safeParse(aFakeMedalWith({ sortingWeight })).success).toBe(false);
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid medal IDs and counts (%s)", (value) => {
    expect(medalSchema.safeParse(aFakeMedalWith({ id: value })).success).toBe(false);
    expect(medalSchema.safeParse(aFakeMedalWith({ count: value })).success).toBe(false);
  });
});
