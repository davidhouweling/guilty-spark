import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndividualTrackerShell } from "../individual-tracker";

function aFakeProps() {
  return {
    authState: "loading" as const,
    errorMessage: null,
    activeSection: "live-trackers" as const,
    onSignIn: () => undefined,
    onSectionChange: () => undefined,
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

  it("shows active section content and hides inactive section when authenticated", () => {
    render(
      <IndividualTrackerShell
        {...aFakeProps()}
        authState="authenticated"
        liveTrackersContent={<div>Live Trackers content</div>}
        statsHighlightsContent={<div>Stats Highlights content</div>}
        streamerSettingsContent={<div>Streamer Settings content</div>}
      />,
    );

    expect(screen.getByText("Live Trackers content")).toBeVisible();
    expect(screen.queryByText("Stats Highlights content")).not.toBeVisible();
    expect(screen.queryByText("Streamer Settings content")).not.toBeVisible();
  });

  it("calls onSectionChange when a tab is clicked", () => {
    const onSectionChange = vi.fn<(id: "live-trackers" | "stats-highlights" | "streamer-settings") => void>();

    render(<IndividualTrackerShell {...aFakeProps()} authState="authenticated" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Stats Highlights" }));

    expect(onSectionChange).toHaveBeenCalledWith("stats-highlights");
  });

  it("renders stats highlights between live trackers and streamer settings", () => {
    render(<IndividualTrackerShell {...aFakeProps()} authState="authenticated" />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Live Trackers",
      "Stats Highlights",
      "Streamer Settings",
    ]);
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
