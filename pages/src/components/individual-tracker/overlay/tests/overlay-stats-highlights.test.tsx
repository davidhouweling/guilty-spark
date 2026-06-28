import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OverlayStatsHighlights } from "../overlay-stats-highlights";

afterEach(() => {
  cleanup();
});

describe("OverlayStatsHighlights", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(<OverlayStatsHighlights items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all provided stat items", () => {
    render(
      <OverlayStatsHighlights
        items={[
          { label: "Won:Loss", value: "5:3" },
          { label: "KDA", value: "3.2" },
        ]}
      />,
    );

    expect(screen.getByText("Won:Loss")).toBeInTheDocument();
    expect(screen.getByText("5:3")).toBeInTheDocument();
    expect(screen.getByText("KDA")).toBeInTheDocument();
    expect(screen.getByText("3.2")).toBeInTheDocument();
  });

  it("renders N/A value for a slot with no data", () => {
    render(<OverlayStatsHighlights items={[{ label: "Kills", value: "N/A" }]} />);

    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});
