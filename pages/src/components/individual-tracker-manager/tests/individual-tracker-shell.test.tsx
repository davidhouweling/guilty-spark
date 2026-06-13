import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndividualTrackerShell } from "../individual-tracker";

afterEach(() => {
  cleanup();
});

describe("IndividualTrackerShell", () => {
  it("renders the heading", () => {
    render(
      <IndividualTrackerShell
        authState="loading"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers</div>}
        streamerSettingsContent={<div>Streamer Settings</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Individual Tracker" })).toBeInTheDocument();
  });

  it("renders loading state while auth is checking", () => {
    render(
      <IndividualTrackerShell
        authState="loading"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers</div>}
        streamerSettingsContent={<div>Streamer Settings</div>}
      />,
    );

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
  });

  it("renders sign-in button when unauthenticated", () => {
    render(
      <IndividualTrackerShell
        authState="unauthenticated"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers</div>}
        streamerSettingsContent={<div>Streamer Settings</div>}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign in with Microsoft" })).toBeInTheDocument();
  });

  it("calls onSignIn when sign-in button is clicked", () => {
    const onSignIn = vi.fn();

    render(
      <IndividualTrackerShell
        authState="unauthenticated"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={onSignIn}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers</div>}
        streamerSettingsContent={<div>Streamer Settings</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Microsoft" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("shows active section content and hides inactive section when authenticated", () => {
    render(
      <IndividualTrackerShell
        authState="authenticated"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers content</div>}
        streamerSettingsContent={<div>Streamer Settings content</div>}
      />,
    );

    expect(screen.getByText("Live Trackers content")).toBeVisible();
    expect(screen.queryByText("Streamer Settings content")).not.toBeVisible();
  });

  it("calls onSectionChange when a tab is clicked", () => {
    const onSectionChange = vi.fn<(id: "live-trackers" | "streamer-settings") => void>();

    render(
      <IndividualTrackerShell
        authState="authenticated"
        errorMessage={null}
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={onSectionChange}
        liveTrackersContent={<div>Live Trackers content</div>}
        streamerSettingsContent={<div>Streamer Settings content</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Streamer Settings" }));

    expect(onSectionChange).toHaveBeenCalledWith("streamer-settings");
  });

  it("shows error message when unauthenticated with an error", () => {
    render(
      <IndividualTrackerShell
        authState="unauthenticated"
        errorMessage="Sign-in failed"
        activeSection="live-trackers"
        onSignIn={() => undefined}
        onSectionChange={() => undefined}
        liveTrackersContent={<div>Live Trackers</div>}
        streamerSettingsContent={<div>Streamer Settings</div>}
      />,
    );

    expect(screen.getByText("Sign-in failed")).toBeInTheDocument();
  });
});
