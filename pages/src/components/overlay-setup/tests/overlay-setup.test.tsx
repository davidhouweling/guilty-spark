import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { AuthService } from "../../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import { aFakeOverlayPreviewServiceWith } from "../../../services/individual-tracker/fakes/overlay-preview.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/stats/fakes/series-matches.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { createOverlaySetupPage } from "../create";
import type { CreateOverlaySetupPageConfig } from "../create";
import { OverlaySetupShell } from "../overlay-setup";

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <span data-testid={`team-icon-${teamId.toString()}`} />
  ),
}));

function previewDependencies(): Pick<
  CreateOverlaySetupPageConfig,
  | "haloClient"
  | "overlayPreviewService"
  | "individualTrackerViewService"
  | "seriesMatchesService"
  | "matchAnalyticsService"
  | "medalMetadataResolver"
> {
  const haloClient = aFakeHaloClientWith();
  return {
    haloClient,
    overlayPreviewService: aFakeOverlayPreviewServiceWith(),
    individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}

function getSettingsCheckbox(section: "In Series" | "Matchmaking", label: string): HTMLElement {
  const checkbox = screen.getAllByRole("checkbox").find((input) => {
    const parentLabel = input.closest("label");
    return parentLabel?.textContent.includes(`${section} ${label}`) ?? false;
  });
  if (checkbox === undefined) {
    throw new Error(`Expected ${section} ${label} checkbox`);
  }
  return checkbox;
}

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
    expect(screen.getByTestId("preview-content")).toBeInTheDocument();
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
      ...previewDependencies(),
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    expect(await screen.findByText("Loading your saved overlay settings…")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /automatically start tracking/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeEnabled();

    resolveSettings({});
  });

  it("keeps URL actions disabled but lets signed-out visitors try settings locally", async () => {
    const user = userEvent.setup();
    const updateSettings: IndividualTrackerSettingsService["updateSettings"] = vi.fn<
      IndividualTrackerSettingsService["updateSettings"]
    >(async (settings) => Promise.resolve(settings));
    const settingsService: IndividualTrackerSettingsService = {
      getSettings: async () => Promise.resolve({}),
      updateSettings,
    };
    const authService: AuthService = {
      getSession: async () => Promise.resolve({ authenticated: false }),
      logout: async () => Promise.resolve(),
    };
    const OverlaySetupPage = createOverlaySetupPage({
      authService,
      settingsService,
      ...previewDependencies(),
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    expect(await screen.findByRole("button", { name: "Open overlay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy overlay URL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy viewer URL" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /automatically start tracking/i })).toBeDisabled();
    expect(screen.getByText(/\/overlay$/)).toBeInTheDocument();
    expect(screen.getByText(/Changes are not saved/i)).toBeInTheDocument();
    const observerButton = screen.getByRole("button", { name: "Observer Mode" });
    expect(observerButton).toBeEnabled();
    await user.click(observerButton);
    expect(observerButton).toHaveAttribute("aria-pressed", "true");
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("switches the preview to the UI section being configured", async () => {
    const user = userEvent.setup();
    const settingsService: IndividualTrackerSettingsService = {
      getSettings: async () => Promise.resolve({}),
      updateSettings: async (settings) => Promise.resolve(settings),
    };
    const authService: AuthService = {
      getSession: async () => Promise.resolve({ authenticated: false }),
      logout: async () => Promise.resolve(),
    };
    const OverlaySetupPage = createOverlaySetupPage({
      authService,
      settingsService,
      ...previewDependencies(),
      apiHost: "https://api.example.com",
    });

    render(<OverlaySetupPage />);

    const seriesTab = await screen.findByRole("button", { name: "Series overlay" });
    const matchmakingTab = screen.getByRole("button", { name: "Matchmaking overlay" });
    expect(seriesTab).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("heading", { name: "Matchmaking UI" })).toBeInTheDocument();

    await user.click(getSettingsCheckbox("Matchmaking", "Show tabs"));
    expect(matchmakingTab).toHaveAttribute("aria-pressed", "true");

    await user.click(getSettingsCheckbox("In Series", "Show tabs"));
    expect(seriesTab).toHaveAttribute("aria-pressed", "true");

    await user.click(getSettingsCheckbox("In Series", "Display Pre-Series Player Info"));
    expect(seriesTab).toHaveAttribute("aria-pressed", "true");

    await user.selectOptions(screen.getByRole("combobox", { name: "Highlight 1" }), "kda");
    expect(matchmakingTab).toHaveAttribute("aria-pressed", "true");
  });
});
