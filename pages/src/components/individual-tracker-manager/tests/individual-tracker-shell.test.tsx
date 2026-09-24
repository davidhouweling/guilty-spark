import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndividualTrackerShell } from "../individual-tracker";

function aFakeProps(): React.ComponentProps<typeof IndividualTrackerShell> {
  return {
    authState: "loading" as const,
    errorMessage: null,
    activeSection: "stats-highlights" as const,
    onSignIn: (): void => undefined,
    onSectionChange: (): void => undefined,
    liveTrackersContent: <div>Live Trackers</div>,
    statsHighlightsContent: <div>Stats Highlights</div>,
    streamerSettingsContent: <div>Streamer Settings</div>,
  };
}

afterEach(() => {
  cleanup();
});

describe("IndividualTrackerShell", () => {
  it("renders the heading", () => {
    render(<IndividualTrackerShell {...aFakeProps()} />);

    expect(screen.getByRole("heading", { name: "Individual Tracker" })).toBeInTheDocument();
  });

  it("renders loading state while auth is checking", () => {
    render(<IndividualTrackerShell {...aFakeProps()} />);

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
  });

  it("renders sign-in button when unauthenticated", () => {
    render(<IndividualTrackerShell {...aFakeProps()} authState="unauthenticated" />);

    expect(screen.getByRole("button", { name: "Sign in with Microsoft" })).toBeInTheDocument();
  });

  it("calls onSignIn when sign-in button is clicked", () => {
    const onSignIn = vi.fn();

    render(<IndividualTrackerShell {...aFakeProps()} authState="unauthenticated" onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Microsoft" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("shows the active tab content, hides the inactive tab, and renders live trackers in the Advanced section when authenticated", () => {
    render(
      <IndividualTrackerShell
        {...aFakeProps()}
        authState="authenticated"
        liveTrackersContent={<div>Live Trackers content</div>}
        statsHighlightsContent={<div>Stats Highlights content</div>}
        streamerSettingsContent={<div>Streamer Settings content</div>}
      />,
    );

    expect(screen.getByText("Stats Highlights content")).toBeVisible();
    expect(screen.queryByText("Streamer Settings content")).not.toBeVisible();
    expect(screen.queryByText("Live Trackers content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Advanced: Manage Trackers" }));

    expect(screen.getByText("Live Trackers content")).toBeVisible();
  });

  it("calls onSectionChange when a tab is clicked", () => {
    const onSectionChange = vi.fn<(id: "stats-highlights" | "streamer-settings") => void>();

    render(<IndividualTrackerShell {...aFakeProps()} authState="authenticated" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Streamer Settings" }));

    expect(onSectionChange).toHaveBeenCalledWith("streamer-settings");
  });

  it("renders the stats highlights and streamer settings tabs, without a live trackers tab", () => {
    render(<IndividualTrackerShell {...aFakeProps()} authState="authenticated" />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Stats Highlights", "Streamer Settings"]);
  });

  it("shows the streamer settings panel when selected", () => {
    render(
      <IndividualTrackerShell
        {...aFakeProps()}
        authState="authenticated"
        activeSection="streamer-settings"
        liveTrackersContent={<div>Live Trackers content</div>}
        statsHighlightsContent={<div>Stats Highlights content</div>}
        streamerSettingsContent={<div>Streamer Settings content</div>}
      />,
    );

    expect(screen.getByText("Streamer Settings content")).toBeVisible();
  });

  it("shows error message when unauthenticated with an error", () => {
    render(<IndividualTrackerShell {...aFakeProps()} authState="unauthenticated" errorMessage="Sign-in failed" />);

    expect(screen.getByText("Sign-in failed")).toBeInTheDocument();
  });
});
