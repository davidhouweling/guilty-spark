import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { AuthService } from "../../../services/auth/types";
import { aFakeIndividualTrackerServiceWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../services/individual-tracker/fakes/view.fake";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import { createOverlaySetupPage } from "../create";
import { OverlaySetupShell } from "../overlay-setup";

describe("OverlaySetupShell", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders all three steps with their content", () => {
    render(
      <OverlaySetupShell
        authState="authenticated"
        gamertag="TestSpartan"
        avatarUrl={null}
        signInHref="https://api.example.com/auth/microsoft/start"
        overlayUrlsContent={<div data-testid="overlay-urls-content" />}
        previewContent={<div data-testid="preview-content" />}
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
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    expect(await screen.findByText("Loading your saved overlay settings…")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /automatically start tracking/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeEnabled();

    resolveSettings({});
  });

  it("disables every overlay URL action and shows the clean overlay URL when logged out", async () => {
    const authService: AuthService = {
      getSession: async () => Promise.resolve({ authenticated: false }),
      logout: async () => Promise.resolve(),
    };
    const settingsService: IndividualTrackerSettingsService = {
      getSettings: async () => Promise.resolve({}),
      updateSettings: async (settings) => Promise.resolve(settings),
    };
    const OverlaySetupPage = createOverlaySetupPage({
      authService,
      settingsService,
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    expect(await screen.findByRole("button", { name: "Open overlay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy overlay URL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy viewer URL" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /automatically start tracking/i })).toBeDisabled();
    expect(screen.getByText(/\/overlay$/)).toBeInTheDocument();
  });
});
