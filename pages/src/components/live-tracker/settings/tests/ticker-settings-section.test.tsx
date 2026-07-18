import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TickerSettingsSection } from "../ticker-settings-section";
import type { TickerSettings } from "../types";

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: true,
  showPreSeriesInfo: true,
  selectedSlayerStats: ["Score", "Kills"],
  showObjectiveStats: false,
  medalRarityFilter: [2, 3],
  showTabs: true,
  maxPreviousGamesToShow: 9,
};

const NOOP_ON_CHANGE: (updates: Partial<TickerSettings>) => void = (): void => undefined;

function renderTickerSettingsSection(options?: {
  readonly settings?: TickerSettings;
  readonly onChange?: (updates: Partial<TickerSettings>) => void;
}): void {
  render(
    <TickerSettingsSection
      settings={options?.settings ?? DEFAULT_TICKER_SETTINGS}
      onChange={options?.onChange ?? NOOP_ON_CHANGE}
    />,
  );
}

describe("TickerSettingsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("allows clearing max previous games input while editing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(updates: Partial<TickerSettings>) => void>();
    renderTickerSettingsSection({ onChange });

    const input = screen.getByLabelText("Max number of previous games to show");
    await user.clear(input);

    expect(input).toHaveValue(null);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps max previous games input changes before emitting updates", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(updates: Partial<TickerSettings>) => void>();
    renderTickerSettingsSection({ onChange });

    const input = screen.getByLabelText("Max number of previous games to show");
    await user.clear(input);
    await user.type(input, "99");

    expect(onChange).toHaveBeenCalledWith({ maxPreviousGamesToShow: 9 });
    expect(onChange).toHaveBeenCalledWith({ maxPreviousGamesToShow: 15 });
  });
});
