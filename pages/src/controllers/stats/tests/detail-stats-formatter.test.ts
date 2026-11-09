import { describe, expect, it } from "vitest";
import type { Stat } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { aFakeStatWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import { DetailStatsFormatter } from "../detail-stats-formatter";

describe("DetailStatsFormatter", () => {
  it("formats supported values and statuses without changing their numeric values or names", () => {
    const stats: Stat[] = [
      aFakeStatWith({ name: "Score", value: 1234.567, prefix: "+" }),
      aFakeStatWith({
        name: "Accuracy",
        format: "percentage",
        value: 52.1234,
        percentage: { scale: "percentage-points", maximumFractionDigits: 2 },
      }),
      aFakeStatWith({
        name: "Contribution",
        format: "percentage",
        value: 0.12345,
        prefix: "~",
        percentage: { scale: "fraction", maximumFractionDigits: 1 },
      }),
      aFakeStatWith({ name: "Default percentage", format: "percentage", value: 12.345 }),
      aFakeStatWith({ name: "Duration", format: "duration-seconds", value: 119.99 }),
      aFakeStatWith({ name: "Zero duration", format: "duration-seconds", value: 0 }),
      aFakeStatWith({ name: "Ratio", format: "ratio", value: 1.23456 }),
      {
        key: "unbounded",
        name: "Unbounded",
        sortBy: StatsValueSortBy.DESC,
        isComparable: true,
        format: "ratio",
        status: "unbounded",
        numerator: 10,
        denominator: 0,
      },
      {
        key: "unavailable",
        name: "Unavailable",
        sortBy: StatsValueSortBy.DESC,
        isComparable: true,
        format: "percentage",
        prefix: "+",
        status: "unavailable",
      },
    ];
    const formatter = new DetailStatsFormatter("en-US");
    const values = stats.map((stat) => formatter.presentStat(stat, new Map(), new Map()));
    expect(values.map(({ name, value, display }) => ({ name, value, display }))).toEqual([
      { name: "Score", value: 1234.567, display: "+1,234.57" },
      { name: "Accuracy", value: 52.1234, display: "52.12%" },
      { name: "Contribution", value: 0.12345, display: "~12.3%" },
      { name: "Default percentage", value: 12.345, display: "12.35%" },
      { name: "Duration", value: 119.99, display: "1m 59s" },
      { name: "Zero duration", value: 0, display: "0s" },
      { name: "Ratio", value: 1.23456, display: "1.23" },
      { name: "Unbounded", value: Infinity, display: "♾️" },
      { name: "Unavailable", value: NaN, display: "n/a" },
    ]);
    expect(values.at(-1)).toMatchObject({ bestInTeam: false, bestInMatch: false });
  });
});
