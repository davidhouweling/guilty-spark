import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LegendItem } from "../legend-item";

afterEach(() => {
  cleanup();
});

describe("LegendItem", () => {
  it("renders the swatch inside a hidden svg beside the text", () => {
    render(<LegendItem swatch={<circle data-testid="swatch" cx={7} cy={7} r={4} />} text="Capture" />);

    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByTestId("swatch").closest("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
