import { describe, expect, it } from "vitest";
import {
  flagAdvantageAxisProps,
  formatScoreValue,
  roundPercent,
  scoreAxisProps,
  scoreTickFormatter,
} from "../chart-constants";

describe("roundPercent", () => {
  it("rounds a lead and its mirror image to the same magnitude", () => {
    expect(roundPercent(12.5)).toBe(13);
    expect(roundPercent(-12.5)).toBe(-13);
    expect(roundPercent(0.4)).toBe(0);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundPercent(-0.3), 0)).toBe(true);
  });
});

describe("formatScoreValue", () => {
  it("formats percent values rounded with a sign and points as they are", () => {
    expect(formatScoreValue(33.4, "percent")).toBe("33%");
    expect(formatScoreValue(-0.4, "percent")).toBe("0%");
    expect(formatScoreValue(12.5, "points")).toBe("12.5");
  });
});

describe("scoreAxisProps", () => {
  it("pins a percent axis to the full meter with wide percent ticks", () => {
    const props = scoreAxisProps("percent");
    expect(props.domain).toEqual([0, 100]);
    expect(props.ticks).toEqual([0, 25, 50, 75, 100]);
    expect(props.width).toBe(40);
    expect(props.tickFormatter(75)).toBe("75%");
  });

  it("leaves a points axis to size itself and hands out one stable formatter per unit", () => {
    const props = scoreAxisProps("points");
    expect(props.domain).toBeUndefined();
    expect(props.ticks).toBeUndefined();
    expect(props.width).toBe(36);
    expect(scoreTickFormatter("points")).toBe(scoreTickFormatter("points"));
    expect(scoreTickFormatter("percent")).toBe(scoreTickFormatter("percent"));
  });
});

describe("flagAdvantageAxisProps", () => {
  it("keeps the shared sign so the first team's lead draws upward, with unsigned ticks", () => {
    const props = flagAdvantageAxisProps([-3, 3]);
    expect(props).not.toHaveProperty("reversed");
    expect(props.domain).toEqual([-3, 3]);
    expect(props.tickFormatter(-2)).toBe("2");
    expect(props.tickFormatter(2)).toBe("2");
  });
});
