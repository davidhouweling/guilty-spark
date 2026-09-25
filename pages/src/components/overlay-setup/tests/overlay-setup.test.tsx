import "@testing-library/jest-dom/vitest";

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { AuthService } from "../../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import { createOverlaySetupPage } from "../create";
import { OverlaySetupShell } from "../overlay-setup";

describe("OverlaySetupShell", () => {
  it("renders all three steps with their content", () => {
    render(
      <OverlaySetupShell
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

  it("keeps URL identity actions available while authenticated settings are loading", async () => {
    let resolveSettings: (settings: StreamerViewSettings) => void = () => undefined;
    const settingsPromise = new Promise<StreamerViewSettings>((resolve) => {
      resolveSettings = resolve;
    });
    const authService: AuthService = {
      getSession: async () =>
        Promise.resolve({
          authenticated: true,
          userId: "user-id",
          expiresAt: 0,
          xboxGamertag: "TestSpartan",
        }),
      logout: async () => Promise.resolve(),
    };
    const settingsService: IndividualTrackerSettingsService = {
      getSettings: async () => settingsPromise,
      updateSettings: async (settings) => Promise.resolve(settings),
    };
    const OverlaySetupPage = createOverlaySetupPage({
      authService,
      settingsService,
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    expect(await screen.findByText("Loading your saved overlay settings…")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /automatically start tracking/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeEnabled();

    resolveSettings({});
  });
});
