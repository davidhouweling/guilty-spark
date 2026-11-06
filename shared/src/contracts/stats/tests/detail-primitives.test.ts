import { describe, expect, it } from "vitest";
import {
  aFakeCondensedMedalWith,
  aFakeCondensedPlayerTeamStatsWith,
  aFakeCondensedPlayerWith,
  aFakeCondensedStatWith,
  aFakeCondensedTeamWith,
} from "../fakes/detail-primitives.fake";
import { aFakeMatchStatsWith } from "../../../halo/fakes/data";
import { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import {
  condensedMedalSchema,
  condensedPlayerContract,
  condensedStatSchema,
  condensedTeamContract,
  condensedTeamMappingSchema,
} from "@guilty-spark/shared/contracts/stats/detail-primitives";

describe("condensed stat primitives", () => {
  it("preserves exact finite values and numeric sorting/formatting metadata", () => {
    const stat = aFakeCondensedStatWith({
      key: "core.averageLifeSeconds",
      name: "Avg life time",
      value: 12.3456789012345,
      sortBy: StatsValueSortBy.ASC,
      format: "duration-seconds",
      prefix: "Avg",
      isComparable: false,
    });
    expect(condensedStatSchema.parse(stat)).toEqual(stat);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite numeric values (%s)", (value) => {
    expect(condensedStatSchema.safeParse(aFakeCondensedStatWith({ value })).success).toBe(false);
  });

  it("rejects invented string sort directions and omitted numeric values", () => {
    expect(condensedStatSchema.safeParse({ ...aFakeCondensedStatWith(), sortBy: "desc" }).success).toBe(false);
    expect(condensedStatSchema.safeParse({ ...aFakeCondensedStatWith(), value: undefined }).success).toBe(false);
  });

  it.each(["number", "percentage", "duration-seconds", "ratio"])(
    "retains the %s numeric format without a pre-rendered display string",
    (format) => {
      const stat = condensedStatSchema.parse({ ...aFakeCondensedStatWith(), format, display: "rounded" });
      expect(stat.format).toBe(format);
      expect(stat).not.toHaveProperty("display");
    },
  );

  it("preserves unbounded ratios without serializing Infinity or inventing a finite default", () => {
    const stat = {
      ...aFakeCondensedStatWith(),
      status: "unbounded",
      format: "ratio",
      numerator: 4200.125,
      denominator: 0,
    };
    expect(condensedStatSchema.parse(stat)).toEqual({
      key: "Kills",
      name: "Kills",
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
      status: "unbounded",
      format: "ratio",
      numerator: 4200.125,
      denominator: 0,
    });
    expect(condensedStatSchema.safeParse({ ...stat, numerator: 0 }).success).toBe(false);
    expect(condensedStatSchema.safeParse({ ...stat, denominator: 1 }).success).toBe(false);
  });

  it("represents unavailable statistics without a fabricated zero", () => {
    const stat = condensedStatSchema.parse({ ...aFakeCondensedStatWith(), status: "unavailable" });
    expect(stat.status).toBe("unavailable");
    expect(stat).not.toHaveProperty("value");
  });
});

describe("condensed player and team primitives", () => {
  it.each(["bid(1)", "bid(2)", "xuid(unresolved)", "unidentified-player"])(
    "round trips the raw stable player key %s without requiring Xbox or Discord identity",
    async (playerId) => {
      const player = aFakeCondensedPlayerWith({ playerId, playerType: 2, xuid: undefined });
      const parsed = await condensedPlayerContract.fromResponse(
        condensedPlayerContract.toResponse(player, { noStore: true }),
      );
      expect(parsed.playerId).toBe(playerId);
      expect(parsed).not.toHaveProperty("xuid");
      expect(parsed).not.toHaveProperty("discordUserId");
    },
  );

  it("retains normalized Xbox and applicable Discord identities without coercion", () => {
    const player = aFakeCondensedPlayerWith({ discordUserId: "987654321098765432" });
    expect(condensedPlayerContract.parse(player)).toEqual(player);
    expect(condensedPlayerContract.safeParse({ ...player, xuid: "xuid(1234567890)" }).success).toBe(false);
    expect(condensedPlayerContract.safeParse({ ...player, discordUserId: "bot" }).success).toBe(false);
  });

  it("keeps swapped nonsequential match IDs separate from stable series IDs", async () => {
    const teams = [
      aFakeCondensedTeamWith({ matchTeamId: 9, seriesTeamId: 0 }),
      aFakeCondensedTeamWith({ matchTeamId: 7, seriesTeamId: 1 }),
    ];
    const roundTrips = await Promise.all(
      teams.map(async (team) => condensedTeamContract.fromResponse(condensedTeamContract.toResponse(team))),
    );
    expect(roundTrips.map(({ matchTeamId, seriesTeamId }) => ({ matchTeamId, seriesTeamId }))).toEqual([
      { matchTeamId: 9, seriesTeamId: 0 },
      { matchTeamId: 7, seriesTeamId: 1 },
    ]);
  });

  it("requires explicit null for ambiguous mapping and preserves player team segments", () => {
    const teamStats = [
      aFakeCondensedPlayerTeamStatsWith({ matchTeamId: 9, seriesTeamId: null }),
      aFakeCondensedPlayerTeamStatsWith({ matchTeamId: 7, seriesTeamId: 1 }),
    ];
    expect(condensedPlayerContract.parse(aFakeCondensedPlayerWith({ teamStats })).teamStats).toEqual(teamStats);
    expect(condensedTeamMappingSchema.parse({ matchTeamId: 9, seriesTeamId: null })).toEqual({
      matchTeamId: 9,
      seriesTeamId: null,
    });
    expect(condensedTeamMappingSchema.safeParse({ matchTeamId: 9 }).success).toBe(false);
  });

  it.each(["Win", "Loss", "Tie", "DNF", "Unknown"])("retains the %s outcome", (outcome) => {
    expect(condensedTeamContract.parse({ ...aFakeCondensedTeamWith(), outcome }).outcome).toBe(outcome);
  });

  it("accepts partial participation and unavailable details without fabricated rosters or ranks", () => {
    const player = aFakeCondensedPlayerWith({
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
    expect(condensedPlayerContract.parse(player)).toEqual(player);
    const team = aFakeCondensedTeamWith({
      seriesTeamId: null,
      name: null,
      rank: null,
      playerIds: [],
      stats: [],
      medals: [],
    });
    expect(condensedTeamContract.parse(team)).toEqual(team);
  });

  it("strips full raw stats and analytics at every serialized player nesting boundary", async () => {
    const player = aFakeCondensedPlayerWith();
    const rawMatch = aFakeMatchStatsWith();
    const contaminated = {
      ...player,
      rawMatch,
      analytics: { rawMatch },
      teamStats: [
        {
          ...aFakeCondensedPlayerTeamStatsWith(),
          Stats: rawMatch,
          stats: [{ ...aFakeCondensedStatWith(), rawMatch, CoreStats: rawMatch }],
          medals: [{ ...aFakeCondensedMedalWith(), rawMatch, mythic: true, points: 100 }],
        },
      ],
    };
    const response = condensedPlayerContract.toResponse(contaminated);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const serialized = await response.text();
    expect(JSON.parse(serialized)).toEqual(player);
    expect(serialized).not.toMatch(/rawMatch|CoreStats|MatchInfo|BotAttributes|analytics|mythic|points/);
  });

  it("strips full raw stats at the team serialization boundary", async () => {
    const team = aFakeCondensedTeamWith();
    const contaminated = { ...team, rawMatch: aFakeMatchStatsWith() };
    const response = condensedTeamContract.toResponse(contaminated);
    expect(await condensedTeamContract.fromResponse(response)).toEqual(team);
  });

  it("retains raw bot roster keys rather than substituting Xbox IDs", () => {
    const team = aFakeCondensedTeamWith({ playerIds: ["bid(1)", "bid(2)", "xuid(unresolved)"] });
    expect(condensedTeamContract.parse(team).playerIds).toEqual(team.playerIds);
  });
});

describe("condensed medal primitives", () => {
  it("preserves actual medal IDs, counts and metadata instead of mythic/points projections", () => {
    const medal = aFakeCondensedMedalWith({ id: 4294967295, count: 3, sortingWeight: 123.5 });
    expect(condensedMedalSchema.parse(medal)).toEqual(medal);
  });

  it("retains unknown medals with explicitly unavailable metadata", () => {
    const medal = aFakeCondensedMedalWith({
      name: null,
      sortingWeight: null,
      difficultyIndex: null,
      difficulty: null,
    });
    expect(condensedMedalSchema.parse(medal)).toEqual(medal);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite medal sorting weights (%s)", (sortingWeight) => {
    expect(condensedMedalSchema.safeParse(aFakeCondensedMedalWith({ sortingWeight })).success).toBe(false);
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid medal IDs and counts (%s)", (value) => {
    expect(condensedMedalSchema.safeParse(aFakeCondensedMedalWith({ id: value })).success).toBe(false);
    expect(condensedMedalSchema.safeParse(aFakeCondensedMedalWith({ count: value })).success).toBe(false);
  });
});
