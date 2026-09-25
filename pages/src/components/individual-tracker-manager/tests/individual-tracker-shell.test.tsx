import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndividualTrackerShell } from "../individual-tracker";

function aFakeProps(): React.ComponentProps<typeof IndividualTrackerShell> {
  return {
    authState: "loading" as const,
    errorMessage: null,
    onSignIn: (): void => undefined,
    liveTrackersContent: <div>Live Trackers</div>,
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

  it("renders the Live Trackers content when authenticated", () => {
    render(
      <IndividualTrackerShell
        {...aFakeProps()}
        authState="authenticated"
        liveTrackersContent={<div>Live Trackers content</div>}
      />,
    );

    expect(screen.getByText("Live Trackers content")).toBeVisible();
  });

  it("shows error message when unauthenticated with an error", () => {
    render(<IndividualTrackerShell {...aFakeProps()} authState="unauthenticated" errorMessage="Sign-in failed" />);

    expect(screen.getByText("Sign-in failed")).toBeInTheDocument();
  });
});
