import "@testing-library/jest-dom/vitest";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamOverlayShell } from "../stream-overlay";

describe("StreamOverlayShell", () => {
  it("renders all three steps with their content", () => {
    render(
      <StreamOverlayShell
        authState="authenticated"
        gamertag="TestSpartan"
        avatarUrl={null}
        signInHref="https://api.example.com/auth/microsoft/start"
        overlayUrlsContent={<div data-testid="overlay-urls-content" />}
        configureContent={<div data-testid="configure-content" />}
      />,
    );

    expect(screen.getByRole("heading", { name: "Step 1: Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Step 2: Overlay and Viewer URLs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Step 3: Configure your overlay" })).toBeInTheDocument();
    expect(screen.getByTestId("overlay-urls-content")).toBeInTheDocument();
    expect(screen.getByTestId("configure-content")).toBeInTheDocument();
  });
});
