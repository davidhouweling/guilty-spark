import { describe, expect, it } from "vitest";
import type { DeltaChartProps } from "../delta-chart";

describe("DeltaChartProps", () => {
  it("accepts a tooltipFormatter callback", () => {
    const props: DeltaChartProps = {
      durationMs: 600000,
      scoreDelta: {
        points: [{ timestampMs: 0, score: 0 }],
        minScore: 0,
        maxScore: 1,
        zeroFraction: 1,
      },
      team0Color: "#ff0000",
      team1Color: "#0000ff",
      tooltipFormatter: (value: unknown): [string, string] => [String(value), "Delta"],
    };
    expect(props.tooltipFormatter(3)).toEqual(["3", "Delta"]);
  });
});
