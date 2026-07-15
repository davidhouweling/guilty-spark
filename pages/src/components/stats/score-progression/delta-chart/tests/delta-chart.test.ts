import { describe, expect, it } from "vitest";
import { formatDeltaTooltip } from "../delta-chart";

describe("formatDeltaTooltip", () => {
  it("returns Tied when value is 0", () => {
    const [label] = formatDeltaTooltip(0, "Eagle", "Cobra");
    expect(label).toBe("Tied");
  });

  it("returns Tied when value is not a number", () => {
    const [label] = formatDeltaTooltip("unknown", "Eagle", "Cobra");
    expect(label).toBe("Tied");
  });

  it("returns team0Name with lead when value is positive", () => {
    const [label] = formatDeltaTooltip(3, "Eagle", "Cobra");
    expect(label).toBe("Eagle +3");
  });

  it("returns team1Name with lead when value is negative", () => {
    const [label] = formatDeltaTooltip(-2, "Eagle", "Cobra");
    expect(label).toBe("Cobra +2");
  });

  it("always returns Score Delta as the series name", () => {
    expect(formatDeltaTooltip(1, "Eagle", "Cobra")[1]).toBe("Score Delta");
    expect(formatDeltaTooltip(0, "Eagle", "Cobra")[1]).toBe("Score Delta");
  });
});
