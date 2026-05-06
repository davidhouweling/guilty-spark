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
        activeTrackerId="tracker-1"
        activeTrackerGamertag="Chief"
        defaultColorMode="observer"
        playerTeamColor="salmon"
        playerEnemyColor="cerulean"
        observerTeamColor="jade"
        observerEnemyColor="tangelo"
        showTabs={true}
        showTicker={true}
        showTeamDetails={true}
        displaySettings={DEFAULT_DISPLAY_SETTINGS}
        tickerSettings={DEFAULT_TICKER_SETTINGS}
        fontSizeSettings={DEFAULT_FONT_SIZES}
        saving={false}
        errorMessage={null}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onPresentationSettingsChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onDefaultColorModeChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onPlayerColorsChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onObserverColorsChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onDisplaySettingsChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onTickerSettingsChange={(): void => {}}
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onFontSizesChange={(): void => {}}
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
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
  });

  it("opens viewer and overlay urls in new tabs", () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));

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

    windowOpenSpy.mockRestore();
  });

  it("invokes presentation settings callback for section toggles", () => {
    const onPresentationSettingsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onPresentationSettingsChange"]>();

    renderComponent({ onPresentationSettingsChange });

    fireEvent.click(screen.getByRole("checkbox", { name: /show overlay tabs/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /show information ticker/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /show team details/i }));

    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(1, {
      showTabs: false,
      showTicker: true,
      showTeamDetails: true,
    });
    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(2, {
      showTabs: true,
      showTicker: false,
      showTeamDetails: true,
    });
    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(3, {
      showTabs: true,
      showTicker: true,
      showTeamDetails: false,
    });
  });

  it("invokes observer colors callback from color pickers", () => {
    const onObserverColorsChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onObserverColorsChange"]>();

    renderComponent({ onObserverColorsChange });

    fireEvent.click(screen.getByLabelText(/select observer team color/i));
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
    const onFontSizesChange =
      vi.fn<React.ComponentProps<typeof StreamerConnectionsSectionView>["onFontSizesChange"]>();

    renderComponent({ onFontSizesChange });

    fireEvent.click(screen.getByRole("button", { name: /font size settings/i }));
    fireEvent.change(screen.getByLabelText(/queue info/i), { target: { value: "110" } });

    expect(onFontSizesChange).toHaveBeenNthCalledWith(1, {
      queueInfo: 110,
    });
  });
});
