import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StreamerConnectionsSectionView } from "../streamer-connections";

afterEach(() => {
  cleanup();
});

describe("StreamerConnectionsSectionView", () => {
  function renderComponent(overrides: Partial<React.ComponentProps<typeof StreamerConnectionsSectionView>> = {}): void {
    render(
      <StreamerConnectionsSectionView
        xboxXuid="2533274844642438"
        defaultColorMode="observer"
        showTabs={true}
        showTicker={true}
        showTeamDetails={true}
        saving={false}
        errorMessage={null}
        onPresentationSettingsChange={(): void => {}}
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

    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/view/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/overlay/i)).toBeInTheDocument();
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

  it("invokes presentation settings callback for color mode and tabs", () => {
    const onPresentationSettingsChange = vi.fn<
      React.ComponentProps<typeof StreamerConnectionsSectionView>["onPresentationSettingsChange"]
    >();

    renderComponent({ onPresentationSettingsChange });

    fireEvent.change(screen.getByLabelText(/default color mode/i), {
      target: { value: "player" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /show overlay tabs/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /show overlay ticker/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /show team details/i }));

    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(1, {
      defaultColorMode: "player",
      showTabs: true,
      showTicker: true,
      showTeamDetails: true,
    });
    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(2, {
      defaultColorMode: "observer",
      showTabs: false,
      showTicker: true,
      showTeamDetails: true,
    });
    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(3, {
      defaultColorMode: "observer",
      showTabs: true,
      showTicker: false,
      showTeamDetails: true,
    });
    expect(onPresentationSettingsChange).toHaveBeenNthCalledWith(4, {
      defaultColorMode: "observer",
      showTabs: true,
      showTicker: true,
      showTeamDetails: false,
    });
  });
});
