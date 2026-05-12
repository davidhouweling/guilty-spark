import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StreamerConnectionsSectionView } from "../streamer-connections";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FONT_SIZES,
  DEFAULT_TICKER_SETTINGS,
} from "../../../live-tracker/settings/types";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("StreamerConnectionsSectionView", () => {
  function renderComponent(overrides: Partial<React.ComponentProps<typeof StreamerConnectionsSectionView>> = {}): void {
    render(
      <StreamerConnectionsSectionView
        xboxXuid="2533274844642438"
        defaultColorMode="observer"
        playerTeamColor="salmon"
        playerEnemyColor="cerulean"
        observerTeamColor="jade"
        observerEnemyColor="tangelo"
        displaySettings={DEFAULT_DISPLAY_SETTINGS}
        tickerSettings={DEFAULT_TICKER_SETTINGS}
        fontSizeSettings={DEFAULT_FONT_SIZES}
        saving={false}
        errorMessage={null}
        onDefaultColorModeChange={(): void => void 0}
        onPlayerColorsChange={(): void => void 0}
        onObserverColorsChange={(): void => void 0}
        onDisplaySettingsChange={(): void => void 0}
        onTickerSettingsChange={(): void => void 0}
        onFontSizesChange={(): void => void 0}
        {...overrides}
      />,
    );
  }

  it("shows warning when no xbox xuid is available", () => {
    renderComponent({ xboxXuid: null });

    expect(screen.getByText(/no active xbox identity is linked/i)).toBeInTheDocument();
  });

  it("renders stable xuid viewer and overlay urls", () => {
    renderComponent();

    expect(screen.getByText(/\/individual-tracker\/2533274844642438\/view/i)).toBeInTheDocument();
    expect(screen.getByText(/\/individual-tracker\/2533274844642438\/overlay/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open overlay with preview" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
  });

  it("opens viewer and overlay urls in new tabs", () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));
    fireEvent.click(screen.getByRole("button", { name: "Open overlay with preview" }));

    expect(windowOpenSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/individual-tracker/2533274844642438/view"),
      "_blank",
    );
    expect(windowOpenSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/individual-tracker/2533274844642438/overlay"),
      "_blank",
    );
    expect(windowOpenSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/individual-tracker/2533274844642438/overlay?preview=1&previewMode=observer"),
      "_blank",
    );

    windowOpenSpy.mockRestore();
  });

  it("invokes observer colors callback from color pickers", () => {
    const onObserverColorsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onObserverColorsChange"]>();

    renderComponent({ onObserverColorsChange });

    fireEvent.click(screen.getByLabelText(/select eagle/i));
    fireEvent.click(screen.getByLabelText(/^Jade$/i));

    expect(onObserverColorsChange).toHaveBeenNthCalledWith(1, {
      teamColor: "jade",
      enemyColor: "tangelo",
    });
  });

  it("invokes display settings callback for display options", () => {
    const onDisplaySettingsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onDisplaySettingsChange"]>();

    renderComponent({ onDisplaySettingsChange });

    fireEvent.click(screen.getByRole("checkbox", { name: /show title \/ server name/i }));

    expect(onDisplaySettingsChange).toHaveBeenNthCalledWith(1, {
      showTitle: false,
    });

    fireEvent.change(screen.getByLabelText(/top stat 1/i), {
      target: { value: "esra" },
    });

    expect(onDisplaySettingsChange).toHaveBeenNthCalledWith(2, {
      topBarStatSlots: [
        "esra",
        "series-win-loss",
        "kills-deaths-assists-kda",
        "damage-dealt-taken-ratio",
        "avg-life-damage-per-life",
        "current-rank",
      ],
    });
  });

  it("invokes ticker settings callback for ticker toggles", () => {
    const onTickerSettingsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onTickerSettingsChange"]>();

    renderComponent({ onTickerSettingsChange });

    fireEvent.click(screen.getByRole("checkbox", { name: /show information ticker/i }));

    expect(onTickerSettingsChange).toHaveBeenNthCalledWith(1, {
      showTicker: false,
    });
  });

  it("invokes font size callback from slider changes", () => {
    const onFontSizesChange = vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onFontSizesChange"]>();

    renderComponent({ onFontSizesChange });

    fireEvent.click(screen.getByRole("button", { name: /font size settings/i }));
    fireEvent.change(screen.getByLabelText(/queue info/i), { target: { value: "110" } });

    expect(onFontSizesChange).toHaveBeenNthCalledWith(1, {
      queueInfo: 110,
    });
  });

  it("shows floating save toast while saving and after save", () => {
    const onDefaultColorModeChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onDefaultColorModeChange"]>();
    const onPlayerColorsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onPlayerColorsChange"]>();
    const onObserverColorsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onObserverColorsChange"]>();
    const onDisplaySettingsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onDisplaySettingsChange"]>();
    const onTickerSettingsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onTickerSettingsChange"]>();
    const onFontSizesChange = vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onFontSizesChange"]>();

    const { rerender } = render(
      <StreamerConnectionsSectionView
        xboxXuid="2533274844642438"
        defaultColorMode="observer"
        playerTeamColor="salmon"
        playerEnemyColor="cerulean"
        observerTeamColor="jade"
        observerEnemyColor="tangelo"
        displaySettings={DEFAULT_DISPLAY_SETTINGS}
        tickerSettings={DEFAULT_TICKER_SETTINGS}
        fontSizeSettings={DEFAULT_FONT_SIZES}
        saving={true}
        errorMessage={null}
        onDefaultColorModeChange={onDefaultColorModeChange}
        onPlayerColorsChange={onPlayerColorsChange}
        onObserverColorsChange={onObserverColorsChange}
        onDisplaySettingsChange={onDisplaySettingsChange}
        onTickerSettingsChange={onTickerSettingsChange}
        onFontSizesChange={onFontSizesChange}
      />,
    );

    expect(screen.getByText(/saving streamer settings/i)).toBeInTheDocument();

    rerender(
      <StreamerConnectionsSectionView
        xboxXuid="2533274844642438"
        defaultColorMode="observer"
        playerTeamColor="salmon"
        playerEnemyColor="cerulean"
        observerTeamColor="jade"
        observerEnemyColor="tangelo"
        displaySettings={DEFAULT_DISPLAY_SETTINGS}
        tickerSettings={DEFAULT_TICKER_SETTINGS}
        fontSizeSettings={DEFAULT_FONT_SIZES}
        saving={false}
        errorMessage={null}
        onDefaultColorModeChange={onDefaultColorModeChange}
        onPlayerColorsChange={onPlayerColorsChange}
        onObserverColorsChange={onObserverColorsChange}
        onDisplaySettingsChange={onDisplaySettingsChange}
        onTickerSettingsChange={onTickerSettingsChange}
        onFontSizesChange={onFontSizesChange}
      />,
    );

    expect(screen.getByText(/streamer settings saved/i)).toBeInTheDocument();
  });

  it("shows floating error toast when save fails", () => {
    renderComponent({ errorMessage: "Failed to save viewer settings." });

    expect(screen.getByText(/failed to save viewer settings/i)).toBeInTheDocument();
  });
});
