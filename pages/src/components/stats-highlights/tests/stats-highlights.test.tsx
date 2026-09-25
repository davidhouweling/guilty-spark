import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStatsHighlightsSection } from "../create";
import type { StatsHighlightsSectionProps } from "../types";

function aFakeProps(overrides: Partial<StatsHighlightsSectionProps> = {}): StatsHighlightsSectionProps {
  return {
    statsHighlightSlots: [],
    saveStatus: "idle",
    saveErrorMessage: null,
    onStatsHighlightSlotsChange: (): void => undefined,
    ...overrides,
  };
}

describe("StatsHighlightsSectionView", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the section as disabled when no stats highlights slots are configured", () => {
    const StatsHighlightsSection = createStatsHighlightsSection();

    render(<StatsHighlightsSection {...aFakeProps()} />);

    expect(screen.getByRole("checkbox", { name: /show stats highlights/i })).not.toBeChecked();
    expect(screen.getByLabelText(/highlight count/i)).toBeDisabled();
    expect(screen.getByText(/stats highlights are currently hidden/i)).toBeInTheDocument();
  });

  it("enables stats highlights with the default six-slot layout", async () => {
    const StatsHighlightsSection = createStatsHighlightsSection();
    const user = userEvent.setup();
    const onStatsHighlightSlotsChange = vi.fn<(statsHighlightSlots: readonly string[]) => void>();

    render(<StatsHighlightsSection {...aFakeProps({ onStatsHighlightSlotsChange })} />);

    await user.click(screen.getByRole("checkbox", { name: /show stats highlights/i }));

    expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith([
      "matches-win-loss",
      "series-win-loss",
      "kills-deaths-assists-kda",
      "damage-dealt-taken-ratio",
      "avg-life-damage-per-life",
      "current-rank",
    ]);
  });

  it("extends the slot list up to eight configured highlights", async () => {
    const StatsHighlightsSection = createStatsHighlightsSection();
    const user = userEvent.setup();
    const onStatsHighlightSlotsChange = vi.fn<(statsHighlightSlots: readonly string[]) => void>();

    render(
      <StatsHighlightsSection
        {...aFakeProps({
          statsHighlightSlots: [
            "matches-win-loss",
            "series-win-loss",
            "kills-deaths-assists-kda",
            "damage-dealt-taken-ratio",
            "avg-life-damage-per-life",
            "current-rank",
          ],
          onStatsHighlightSlotsChange,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/highlight count/i), "8");

    expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith([
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
    const StatsHighlightsSection = createStatsHighlightsSection();
    const user = userEvent.setup();
    const onStatsHighlightSlotsChange = vi.fn<(statsHighlightSlots: readonly string[]) => void>();

    render(
      <StatsHighlightsSection
        {...aFakeProps({
          statsHighlightSlots: ["matches-win-loss", "series-win-loss"],
          onStatsHighlightSlotsChange,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/highlight 1/i), "esra");

    expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith(["esra", "series-win-loss"]);
  });

  it("groups stat options into individual, compacted, and profile sections", () => {
    const StatsHighlightsSection = createStatsHighlightsSection();

    const { container } = render(
      <StatsHighlightsSection
        {...aFakeProps({
          statsHighlightSlots: ["matches-win-loss"],
        })}
      />,
    );

    const optgroupLabels = Array.from(container.querySelectorAll("optgroup")).map((optgroup) =>
      optgroup.getAttribute("label"),
    );

    expect(optgroupLabels).toEqual(["Individual stats", "Compacted stats", "Profile stats"]);
  });
});
