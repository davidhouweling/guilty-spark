import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatsHighlightsSectionView } from "../stats-highlights";

function aFakeProps(
  overrides: Partial<React.ComponentProps<typeof StatsHighlightsSectionView>> = {},
): React.ComponentProps<typeof StatsHighlightsSectionView> {
  return {
    topBarStatSlots: [],
    saveStatus: "idle",
    saveErrorMessage: null,
    onTopBarStatSlotsChange: (): void => undefined,
    ...overrides,
  };
}

describe("StatsHighlightsSectionView", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the section as disabled when no top-bar slots are configured", () => {
    render(<StatsHighlightsSectionView {...aFakeProps()} />);

    expect(screen.getByRole("checkbox", { name: /show stats highlights/i })).not.toBeChecked();
    expect(screen.getByLabelText(/highlight count/i)).toBeDisabled();
    expect(screen.getByText(/stats highlights are currently hidden/i)).toBeInTheDocument();
  });

  it("enables stats highlights with the default six-slot layout", async () => {
    const user = userEvent.setup();
    const onTopBarStatSlotsChange = vi.fn<(topBarStatSlots: readonly string[]) => void>();

    render(<StatsHighlightsSectionView {...aFakeProps({ onTopBarStatSlotsChange })} />);

    await user.click(screen.getByRole("checkbox", { name: /show stats highlights/i }));

    expect(onTopBarStatSlotsChange).toHaveBeenCalledWith([
      "matches-win-loss",
      "series-win-loss",
      "kills-deaths-assists-kda",
      "damage-dealt-taken-ratio",
      "avg-life-damage-per-life",
      "current-rank",
    ]);
  });

  it("extends the slot list up to eight configured highlights", async () => {
    const user = userEvent.setup();
    const onTopBarStatSlotsChange = vi.fn<(topBarStatSlots: readonly string[]) => void>();

    render(
      <StatsHighlightsSectionView
        {...aFakeProps({
          topBarStatSlots: [
            "matches-win-loss",
            "series-win-loss",
            "kills-deaths-assists-kda",
            "damage-dealt-taken-ratio",
            "avg-life-damage-per-life",
            "current-rank",
          ],
          onTopBarStatSlotsChange,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/highlight count/i), "8");

    expect(onTopBarStatSlotsChange).toHaveBeenCalledWith([
      "matches-win-loss",
      "series-win-loss",
      "kills-deaths-assists-kda",
      "damage-dealt-taken-ratio",
      "avg-life-damage-per-life",
      "current-rank",
      "all-time-peak",
      "esra",
    ]);
  });

  it("updates an individual highlight slot", async () => {
    const user = userEvent.setup();
    const onTopBarStatSlotsChange = vi.fn<(topBarStatSlots: readonly string[]) => void>();

    render(
      <StatsHighlightsSectionView
        {...aFakeProps({
          topBarStatSlots: ["matches-win-loss", "series-win-loss"],
          onTopBarStatSlotsChange,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/highlight 1/i), "esra");

    expect(onTopBarStatSlotsChange).toHaveBeenCalledWith(["esra", "series-win-loss"]);
  });

  it("groups stat options into individual, compacted, and profile sections", () => {
    const { container } = render(
      <StatsHighlightsSectionView
        {...aFakeProps({
          topBarStatSlots: ["matches-win-loss"],
        })}
      />,
    );

    const optgroupLabels = Array.from(container.querySelectorAll("optgroup")).map((optgroup) =>
      optgroup.getAttribute("label"),
    );

    expect(optgroupLabels).toEqual(["Individual stats", "Compacted stats", "Profile stats"]);
  });
});
