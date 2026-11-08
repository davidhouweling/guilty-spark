import { describe, expect, it } from "vitest";
import type { Stats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { Preconditions } from "../../base/preconditions";
import { statSchema } from "../../contracts/stats/detail-primitives";
import {
  aFakeCoreStatsWith,
  aFakeCtfStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "../fakes/data";
import { calculateSeriesPlayerStats } from "../series-stat-calculation";
import { getCtfObjectiveStatValues } from "../objective-stats-values";
import { getPlayerSlayerStatValues, getPlayerSlayerStats } from "../slayer-stats";
import { serializeStatDetails } from "../stat-detail-serialization";
import { StatsValueSortBy } from "../stat-formatting";
import type { StatsCollection } from "../types";

describe("serializeStatDetails", () => {
  it("preserves order, values and metadata while discarding preformatted strings", () => {
    const coreStats = aFakeCoreStatsWith();
    const values: StatsCollection = new Map([
      [
        "Custom",
        { value: -7.123456789, sortBy: StatsValueSortBy.ASC, display: "not numeric", prefix: "±", isComparable: false },
      ],
      ["Accuracy", { value: 123.456789, sortBy: StatsValueSortBy.DESC, display: "rounded" }],
      ["Kills", { value: 0, sortBy: StatsValueSortBy.DESC, prefix: "", isComparable: true }],
    ]);
    const valuesBefore = structuredClone(values);
    const coreBefore = structuredClone(coreStats);
    const expected = [
      {
        key: "Custom",
        name: "Custom",
        sortBy: StatsValueSortBy.ASC,
        isComparable: false,
        format: "number",
        prefix: "±",
        status: "available",
        value: -7.123456789,
      },
      {
        key: "Accuracy",
        name: "Accuracy",
        sortBy: StatsValueSortBy.DESC,
        isComparable: true,
        format: "percentage",
        percentage: { scale: "percentage-points", maximumFractionDigits: 2 },
        status: "available",
        value: 123.456789,
      },
      {
        key: "Kills",
        name: "Kills",
        sortBy: StatsValueSortBy.DESC,
        isComparable: true,
        format: "number",
        prefix: "",
        status: "available",
        value: 0,
      },
    ];

    const result = serializeStatDetails(values, coreStats);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    expect(result.map((stat) => statSchema.parse(stat))).toEqual(expected);
    expect(values).toEqual(valuesBefore);
    expect(coreStats).toEqual(coreBefore);
  });

  it("serializes actual Slayer numeric helpers identically with or without display enrichment", () => {
    const coreStats = aFakeCoreStatsWith({
      DamageDealt: 10000,
      DamageTaken: 3,
      Deaths: 6,
      AverageLifeDuration: "PT38.123S",
    });
    const numeric = serializeStatDetails(getPlayerSlayerStatValues(coreStats), coreStats);
    const displayed = serializeStatDetails(getPlayerSlayerStats(coreStats), coreStats);

    expect(displayed).toEqual(numeric);
    expect(numeric.find((stat) => stat.key === "Damage ratio")).toMatchObject({
      status: "available",
      format: "ratio",
      value: 10000 / 3,
    });
    expect(numeric.find((stat) => stat.key === "Avg damage per life")).toMatchObject({
      status: "available",
      format: "ratio",
      value: 10000 / 7,
    });
    expect(numeric.find((stat) => stat.key === "Avg life time")).toMatchObject({
      status: "available",
      format: "duration-seconds",
      value: 38.1,
    });
  });

  it.each([
    "Avg life time",
    "Carrier time",
    "Total time as carrier",
    "Longest time as carrier",
    "Occupation time",
    "Time as last spartan standing",
    "Time as power seed carrier",
    "Time as power seed driver",
    "Longest Time as VIP",
    "Time as VIP",
    "Objective time",
  ])("marks the exact duration key %s as seconds without rounding", (key) => {
    const values: StatsCollection = new Map([[key, { value: 90.123456, sortBy: StatsValueSortBy.DESC }]]);
    expect(serializeStatDetails(values, aFakeCoreStatsWith())).toEqual([
      {
        key,
        name: key,
        sortBy: StatsValueSortBy.DESC,
        isComparable: true,
        format: "duration-seconds",
        status: "available",
        value: 90.123456,
      },
    ]);
  });

  it("uses actual CTF extraction seconds", () => {
    const stats = aFakeCtfStatsWith({ TimeAsFlagCarrier: "PT1M30.125S" });
    expect(
      serializeStatDetails(getCtfObjectiveStatValues(stats), stats.CoreStats).find(
        (stat) => stat.key === "Carrier time",
      ),
    ).toMatchObject({ status: "available", format: "duration-seconds", value: 90.1 });
  });

  it.each([
    { teamTime: "PT60S", status: "available", value: 0.5 },
    { teamTime: "PT0S", status: "unavailable", value: undefined },
  ])(
    "preserves actual series objective duration and $status fractional contribution",
    ({ teamTime, status, value }) => {
      expect.assertions(status === "unavailable" ? 4 : 3);
      const match = aFakeMatchStatsWith({
        MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerCtf },
        Teams: [aFakeTeamWith({ TeamId: 7, Stats: aFakeCtfStatsWith({ TimeAsFlagCarrier: teamTime }) })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1)",
            LastTeamId: 7,
            PlayerTeamStats: [{ TeamId: 7, Stats: aFakeCtfStatsWith({ TimeAsFlagCarrier: "PT30S" }) }],
          }),
        ],
      });
      const player = Preconditions.checkExists(calculateSeriesPlayerStats([match]).teams[0]?.players[0]);
      const result = serializeStatDetails(player.values, player.coreStats);
      expect(result.find((stat) => stat.key === "Objective time")).toMatchObject({
        format: "duration-seconds",
        value: 30,
      });
      const contribution = Preconditions.checkExists(result.find((stat) => stat.key === "Team objective contribution"));
      expect(contribution).toEqual({
        key: "Team objective contribution",
        name: "Team objective contribution",
        sortBy: StatsValueSortBy.DESC,
        isComparable: status === "available",
        format: "percentage",
        percentage: { scale: "fraction", maximumFractionDigits: 1 },
        status,
        ...(value === undefined ? {} : { value }),
      });
      expect(statSchema.parse(JSON.parse(JSON.stringify(contribution)))).toEqual(contribution);
      if (status === "unavailable") {
        expect(contribution).not.toHaveProperty("value");
      }
    },
  );

  it.each([-1, 1.5, 21])("rejects invalid percentage precision %s in the contract", (maximumFractionDigits) => {
    const stat = serializeStatDetails(getPlayerSlayerStatValues(aFakeCoreStatsWith()), aFakeCoreStatsWith()).find(
      (entry) => entry.key === "Accuracy",
    );
    expect(
      statSchema.safeParse({ ...stat, percentage: { scale: "percentage-points", maximumFractionDigits } }).success,
    ).toBe(false);
  });

  it("accepts existing percentage contracts without metadata but rejects an unknown explicit scale", () => {
    const metadata = {
      key: "Accuracy",
      name: "Accuracy",
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
      format: "percentage",
      status: "available",
      value: 50,
    };
    expect(statSchema.parse(metadata)).toEqual(metadata);
    expect(
      statSchema.safeParse({
        ...metadata,
        percentage: { scale: "unknown", maximumFractionDigits: 2 },
      }).success,
    ).toBe(false);
  });

  it.each([
    "Unknown time",
    "Longest time as VIP",
    "Times selected as VIP",
    "Rounds Survived",
    "Boss kills",
    "Initiations completed",
    "Custom ratio",
  ])("keeps arbitrary or count key %s numeric rather than guessing semantics", (key) => {
    const values: StatsCollection = new Map([[key, { value: 1.25, sortBy: StatsValueSortBy.ASC }]]);
    expect(serializeStatDetails(values, aFakeCoreStatsWith())[0]).toMatchObject({ format: "number", value: 1.25 });
  });

  it.each([
    { key: "Damage ratio", overrides: { DamageDealt: 12345.6789, DamageTaken: 0 } },
    { key: "Avg damage per life", overrides: { DamageDealt: 12345.6789, Deaths: -1 } },
  ])("serializes actual unbounded $key with its original numerator", ({ key, overrides }) => {
    const coreStats = aFakeCoreStatsWith(overrides);
    const values = getPlayerSlayerStatValues(coreStats);
    const source = values.get(key);
    const expected = {
      key,
      name: key,
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
      format: "ratio",
      status: "unbounded",
      numerator: 12345.6789,
      denominator: 0,
    };
    const result = serializeStatDetails(values, coreStats).find((stat) => stat.key === key);

    expect(source?.value).toBe(Number.POSITIVE_INFINITY);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    expect(statSchema.parse(result)).toEqual(expected);
    expect(values.get(key)).toEqual(source);
  });

  it("preserves available zero ratios from the actual helper when both damage values are zero", () => {
    const coreStats = aFakeCoreStatsWith({ DamageDealt: 0, DamageTaken: 0 });
    const result = serializeStatDetails(getPlayerSlayerStatValues(coreStats), coreStats);
    expect(result.find((stat) => stat.key === "Damage ratio")).toMatchObject({
      status: "available",
      format: "ratio",
      value: 0,
    });
  });

  it("does not recompute finite supplied ratios", () => {
    const values: StatsCollection = new Map([["Damage ratio", { value: 2.123456789, sortBy: StatsValueSortBy.DESC }]]);
    expect(serializeStatDetails(values, aFakeCoreStatsWith({ DamageTaken: 0 }))[0]).toMatchObject({
      status: "available",
      value: 2.123456789,
    });
  });

  it.each([
    { key: "Kills", value: Number.NaN },
    { key: "Accuracy", value: Number.POSITIVE_INFINITY },
    { key: "Custom ratio", value: Number.POSITIVE_INFINITY },
    { key: "Avg life time", value: Number.NEGATIVE_INFINITY },
    { key: "Damage ratio", value: Number.NaN },
    { key: "Damage ratio", value: Number.NEGATIVE_INFINITY },
    { key: "Avg damage per life", value: Number.NaN },
    { key: "Avg damage per life", value: Number.NEGATIVE_INFINITY },
  ])("rejects invalid non-finite $key value $value explicitly", ({ key, value }) => {
    const values: StatsCollection = new Map([[key, { value, sortBy: StatsValueSortBy.DESC }]]);
    expect(() => serializeStatDetails(values, aFakeCoreStatsWith())).toThrow(
      `Cannot serialize non-finite stat "${key}"`,
    );
  });

  const inconsistentSources: { key: string; overrides: Partial<Stats["CoreStats"]> }[] = [
    { key: "Damage ratio", overrides: { DamageDealt: 0, DamageTaken: 0 } },
    { key: "Damage ratio", overrides: { DamageDealt: -1, DamageTaken: 0 } },
    { key: "Damage ratio", overrides: { DamageDealt: Number.POSITIVE_INFINITY, DamageTaken: 0 } },
    { key: "Damage ratio", overrides: { DamageDealt: Number.NaN, DamageTaken: 0 } },
    { key: "Damage ratio", overrides: { DamageTaken: 1 } },
    { key: "Damage ratio", overrides: { DamageTaken: Number.NaN } },
    { key: "Avg damage per life", overrides: { Deaths: 0 } },
    { key: "Avg damage per life", overrides: { Deaths: Number.POSITIVE_INFINITY } },
    { key: "Avg damage per life", overrides: { DamageDealt: 0, Deaths: -1 } },
  ];

  it.each(inconsistentSources)("rejects inconsistent unbounded $key sources $overrides", ({ key, overrides }) => {
    const values: StatsCollection = new Map([
      [key, { value: Number.POSITIVE_INFINITY, sortBy: StatsValueSortBy.DESC }],
    ]);
    expect(() => serializeStatDetails(values, aFakeCoreStatsWith(overrides))).toThrow(
      `Cannot serialize unbounded stat "${key}": inconsistent ratio source`,
    );
  });

  it("returns no stats for an empty collection", () => {
    expect(serializeStatDetails(new Map(), aFakeCoreStatsWith())).toEqual([]);
  });
});
