import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankIcon } from "../rank-icon";

describe("RankIcon", () => {
  it("renders Diamond 1 icon when subtier is 0", () => {
    render(
      <RankIcon
        rankTier="Diamond"
        subTier={0}
        measurementMatchesRemaining={0}
        initialMeasurementMatches={5}
        size="small"
      />,
    );

    const icon = screen.getByRole("img", { name: "Diamond 1" });
    expect(icon).toBeDefined();
  });

  it("renders Diamond 1 icon when subtier is null", () => {
    render(
      <RankIcon
        rankTier="Diamond"
        subTier={null}
        measurementMatchesRemaining={0}
        initialMeasurementMatches={5}
        size="small"
      />,
    );

    const icon = screen.getByRole("img", { name: "Diamond 1" });
    expect(icon).toBeDefined();
  });
});
