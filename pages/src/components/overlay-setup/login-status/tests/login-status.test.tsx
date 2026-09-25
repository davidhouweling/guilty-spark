import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LoginStatusSectionProps } from "../types";
import { LoginStatusSection } from "../login-status";

function aFakeProps(overrides?: Partial<LoginStatusSectionProps>): LoginStatusSectionProps {
  return {
    authState: "authenticated",
    gamertag: "TestSpartan",
    avatarUrl: null,
    signInHref: "https://api.example.com/auth/microsoft/start",
    ...overrides,
  };
}

describe("LoginStatusSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading indicator while checking the session", () => {
    render(<LoginStatusSection {...aFakeProps({ authState: "loading" })} />);

    expect(screen.getByText("Checking session...")).toBeInTheDocument();
  });

  it("shows the signed-in gamertag when authenticated", () => {
    render(<LoginStatusSection {...aFakeProps({ authState: "authenticated", gamertag: "TestSpartan" })} />);

    expect(screen.getByText("Logged in as")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TestSpartan", level: 3 })).toBeInTheDocument();
  });

  it("shows a sign-in CTA linking to the sign-in href when unauthenticated", () => {
    render(
      <LoginStatusSection
        {...aFakeProps({ authState: "unauthenticated", signInHref: "https://api.example.com/auth/microsoft/start" })}
      />,
    );

    expect(screen.getByRole("link", { name: "Sign in with Microsoft" })).toHaveAttribute(
      "href",
      "https://api.example.com/auth/microsoft/start",
    );
  });

  it("renders a retry action for failed session loads", () => {
    render(
      <LoginStatusSection
        {...aFakeProps({
          authState: "error",
          errorMessage: "Failed to load session. Please refresh the page.",
          onRetry: () => undefined,
        })}
      />,
    );

    expect(screen.getByText("Connection Failed")).toBeInTheDocument();
    expect(screen.getByText("Failed to load session. Please refresh the page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Connection" })).toBeInTheDocument();
  });
});
