import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StreamerConnectionsSectionView } from "../streamer-connections";

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
        saving={false}
        errorMessage={null}
        onPresentationSettingsChange={(): void => {}}
        onPlayerColorsChange={(): void => {}}
        onObserverColorsChange={(): void => {}}
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

  it("invokes open callbacks with xuid", () => {
    const onOpenView = vi.fn<(xuid: string) => void>();
    const onOpenOverlay = vi.fn<(xuid: string) => void>();

    renderComponent({ onOpenView, onOpenOverlay });

    fireEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));

    expect(onOpenView).toHaveBeenCalledWith("2533274844642438");
    expect(onOpenOverlay).toHaveBeenCalledWith("2533274844642438");
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
});
