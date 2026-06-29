import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../../live-tracker/settings/types";
import type { StreamerSettingsSectionViewProps } from "../streamer-settings";
import { StreamerSettingsSectionView } from "../streamer-settings";

vi.mock("../../../team-colors/team-color-picker", () => ({
  TeamColorPicker: ({ label }: { readonly label: string }): React.ReactElement => (
    <div data-testid={`color-picker-${label}`} />
  ),
}));

vi.mock("../../../live-tracker/settings/display-settings-section", () => ({
  DisplaySettingsSection: (): React.ReactElement => <div data-testid="display-settings-section" />,
}));

vi.mock("../../../live-tracker/settings/ticker-settings-section", () => ({
  TickerSettingsSection: (): React.ReactElement => <div data-testid="ticker-settings-section" />,
}));

vi.mock("../../../live-tracker/settings/font-size-slider", () => ({
  FontSizeSlider: ({ label }: { readonly label: string }): React.ReactElement => (
    <div data-testid={`font-size-slider-${label}`} />
  ),
}));

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showTeamDetails: false,
  showDiscordNames: true,
  showXboxNames: true,
  showServerIcon: true,
  showTitle: true,
  showSubtitle: true,
  showScore: true,
};

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: true,
  showTabs: true,
  showPreSeriesInfo: true,
  selectedSlayerStats: [],
  showObjectiveStats: false,
  medalRarityFilter: [],
};

const DEFAULT_FONT_SIZE_SETTINGS: FontSizeSettings = {
  queueInfo: 100,
  score: 100,
  teams: 100,
  tabs: 100,
  ticker: 100,
};

function aFakeProps(overrides?: Partial<StreamerSettingsSectionViewProps>): StreamerSettingsSectionViewProps {
  return {
    gamertag: "gamertag-123",
    defaultColorMode: "player",
    playerTeamColor: "cerulean",
    playerEnemyColor: "salmon",
    observerTeamColor: "salmon",
    observerEnemyColor: "cerulean",
    displaySettings: DEFAULT_DISPLAY_SETTINGS,
    tickerSettings: DEFAULT_TICKER_SETTINGS,
    fontSizeSettings: DEFAULT_FONT_SIZE_SETTINGS,
    saveStatus: "idle",
    saveErrorMessage: null,
    onDefaultColorModeChange: (): void => undefined,
    onPlayerColorsChange: (): void => undefined,
    onObserverColorsChange: (): void => undefined,
    onDisplaySettingsChange: (): void => undefined,
    onTickerSettingsChange: (): void => undefined,
    onFontSizesChange: (): void => undefined,
    ...overrides,
  };
}

describe("StreamerSettingsSectionView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("URL panel", () => {
    it("renders the viewer and overlay URLs when gamertag is provided", () => {
      vi.stubGlobal("location", { origin: "https://example.com" });
      render(<StreamerSettingsSectionView {...aFakeProps({ gamertag: "gamertag-abc" })} />);

      expect(screen.getByText(/\/u\/gamertag-abc\/view/)).toBeInTheDocument();
      expect(screen.getByText(/\/u\/gamertag-abc\/overlay/)).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    it("renders a warning alert when gamertag is null", () => {
      render(<StreamerSettingsSectionView {...aFakeProps({ gamertag: null })} />);

      expect(screen.getByText(/No active Xbox identity is linked/)).toBeInTheDocument();
    });

    it("calls the clipboard API when the view copy button is clicked", async () => {
      const user = userEvent.setup();
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      vi.stubGlobal("location", { origin: "https://example.com" });

      render(<StreamerSettingsSectionView {...aFakeProps({ gamertag: "gamertag-abc" })} />);

      const copyButtons = screen.getAllByRole("button", { name: "Copy" });
      await user.click(copyButtons[0]);

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/u/gamertag-abc/view"));

      vi.unstubAllGlobals();
    });

    it("shows Copied! on the view button after a successful copy", async () => {
      const user = userEvent.setup({ delay: null });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("navigator", {
        clipboard: { writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) },
      });
      vi.stubGlobal("location", { origin: "https://example.com" });

      render(<StreamerSettingsSectionView {...aFakeProps({ gamertag: "gamertag-abc" })} />);

      const copyButtons = screen.getAllByRole("button", { name: "Copy" });
      await user.click(copyButtons[0]);

      expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
  });

  describe("presentation defaults", () => {
    it("highlights the active color mode button", () => {
      render(<StreamerSettingsSectionView {...aFakeProps({ defaultColorMode: "observer" })} />);

      const observerBtn = screen.getByRole("button", { name: "Observer Mode" });
      expect(observerBtn).toBeInTheDocument();
    });

    it("calls onDefaultColorModeChange when Player Mode is clicked", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(mode: "player" | "observer") => void>();

      render(
        <StreamerSettingsSectionView
          {...aFakeProps({ defaultColorMode: "observer", onDefaultColorModeChange: onChange })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Player Mode" }));

      expect(onChange).toHaveBeenCalledWith("player");
    });

    it("calls onDefaultColorModeChange when Observer Mode is clicked", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(mode: "player" | "observer") => void>();

      render(
        <StreamerSettingsSectionView
          {...aFakeProps({ defaultColorMode: "player", onDefaultColorModeChange: onChange })}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Observer Mode" }));

      expect(onChange).toHaveBeenCalledWith("observer");
    });

    it("disables mode buttons while saving", () => {
      render(<StreamerSettingsSectionView {...aFakeProps({ saveStatus: "saving" })} />);

      expect(screen.getByRole("button", { name: "Player Mode" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Observer Mode" })).toBeDisabled();
    });
  });

  describe("save toast", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows a saving message when saveStatus is saving", () => {
      render(<StreamerSettingsSectionView {...aFakeProps({ saveStatus: "saving" })} />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("Saving streamer settings...")).toBeInTheDocument();
    });

    it("shows an error message when saveStatus is error", () => {
      render(
        <StreamerSettingsSectionView
          {...aFakeProps({ saveStatus: "error", saveErrorMessage: "Network failure" })}
        />,
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });

    it("does not show the toast when saveStatus is idle", () => {
      render(<StreamerSettingsSectionView {...aFakeProps({ saveStatus: "idle" })} />);

      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("sub-sections", () => {
    it("renders the display settings section", () => {
      render(<StreamerSettingsSectionView {...aFakeProps()} />);

      expect(screen.getByTestId("display-settings-section")).toBeInTheDocument();
    });

    it("renders the ticker settings section", () => {
      render(<StreamerSettingsSectionView {...aFakeProps()} />);

      expect(screen.getByTestId("ticker-settings-section")).toBeInTheDocument();
    });

    it("renders font size sliders for all sections", () => {
      render(<StreamerSettingsSectionView {...aFakeProps()} />);

      expect(screen.getByTestId("font-size-slider-Queue Info")).toBeInTheDocument();
      expect(screen.getByTestId("font-size-slider-Score")).toBeInTheDocument();
      expect(screen.getByTestId("font-size-slider-Teams")).toBeInTheDocument();
      expect(screen.getByTestId("font-size-slider-Tabs")).toBeInTheDocument();
      expect(screen.getByTestId("font-size-slider-Info Ticker")).toBeInTheDocument();
    });

    it("renders color pickers for player and observer views", () => {
      render(<StreamerSettingsSectionView {...aFakeProps()} />);

      expect(screen.getByTestId("color-picker-Player team color")).toBeInTheDocument();
      expect(screen.getByTestId("color-picker-Player enemy color")).toBeInTheDocument();
      expect(screen.getByTestId("color-picker-Eagle")).toBeInTheDocument();
      expect(screen.getByTestId("color-picker-Cobra")).toBeInTheDocument();
    });
  });
});
