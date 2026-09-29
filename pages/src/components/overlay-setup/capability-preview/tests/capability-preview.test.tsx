import "@testing-library/jest-dom/vitest";

import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { aFakeFollowLiveServiceWith } from "../../../../services/follow/fakes/follow.fake";
import { aFakeOverlayPreviewServiceWith } from "../../../../services/individual-tracker/fakes/overlay-preview.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import type { OverlayPreviewService } from "../../../../services/individual-tracker/overlay-preview-types";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../../services/stats/series-matches-types";
import { createIndividualTrackerOverlayPage } from "../../../individual-tracker/overlay/create";
import { createIndividualTrackerViewerPage } from "../../../individual-tracker/viewer/create";
import { CapabilityPreviewPresenter } from "../capability-preview-presenter";
import { CapabilityPreviewStore } from "../capability-preview-store";
import type { CapabilityPreviewTab } from "../types";
import { createCapabilityPreview } from "../create";

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <span data-testid={`team-icon-${teamId.toString()}`} />
  ),
}));

function createPageComponents(): {
  readonly OverlayPage: ReturnType<typeof createIndividualTrackerOverlayPage>;
  readonly ViewerPage: ReturnType<typeof createIndividualTrackerViewerPage>;
  readonly getSeriesMatches: MockInstance<SeriesMatchesService["getSeriesMatches"]>;
} {
  const haloClient = aFakeHaloClientWith();
  const medalMetadataResolver = new HaloMedalMetadataResolver(haloClient);
  const baseSeriesMatchesService = aFakeSeriesMatchesServiceWith();
  const getSeriesMatches = vi.spyOn(baseSeriesMatchesService, "getSeriesMatches");
  const seriesMatchesService: SeriesMatchesService = {
    getSeriesMatches: async (...[matchIds, , anchorMatchId]: Parameters<SeriesMatchesService["getSeriesMatches"]>) => {
      return getSeriesMatches(matchIds, undefined, anchorMatchId);
    },
  };
  const baseMatchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const matchAnalyticsService: MatchAnalyticsService = {
    getBatchMatchAnalytics: async (...[matchIds]: Parameters<MatchAnalyticsService["getBatchMatchAnalytics"]>) => {
      return baseMatchAnalyticsService.getBatchMatchAnalytics(matchIds);
    },
  };
  const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith();

  return {
    OverlayPage: createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService,
      seriesMatchesService,
      haloClient,
      medalMetadataResolver,
    }),
    ViewerPage: createIndividualTrackerViewerPage({
      individualTrackerViewService,
      matchAnalyticsService,
      seriesMatchesService,
      medalMetadataResolver,
    }),
    getSeriesMatches,
  };
}

interface RenderPreviewOptions {
  readonly gamertag: string | null;
  readonly isAuthenticated: boolean;
  readonly previewMode: "player" | "observer";
  readonly previewService: OverlayPreviewService;
  readonly pages: ReturnType<typeof createPageComponents>;
}

function renderCapabilityPreview(options: RenderPreviewOptions): void {
  const store = new CapabilityPreviewStore();
  const presenter = new CapabilityPreviewPresenter({
    previewService: options.previewService,
    followLiveService: aFakeFollowLiveServiceWith(),
    store,
  });
  const identityKey = options.isAuthenticated ? `authenticated:${options.gamertag ?? ""}` : "demo";
  const activateMode = (tab: CapabilityPreviewTab): void => {
    presenter.load(tab === "viewer" ? "matchmaking" : tab, undefined, identityKey);
  };
  const CapabilityPreview = createCapabilityPreview(options.pages);
  render(
    <CapabilityPreview
      presenter={presenter}
      identityKey={identityKey}
      settingsReady
      gamertag={options.gamertag}
      isAuthenticated={options.isAuthenticated}
      previewMode={options.previewMode}
      streamerSettings={undefined}
      onActivateMode={activateMode}
      onRetry={(mode): void => {
        presenter.retry(mode, undefined, identityKey);
      }}
    />,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("CapabilityPreview", () => {
  it("switches real endpoint views and labels the demo identity", async () => {
    const user = userEvent.setup();
    const previewService = aFakeOverlayPreviewServiceWith();
    const pages = createPageComponents();

    renderCapabilityPreview({
      gamertag: "343GuiltySpark",
      isAuthenticated: false,
      previewMode: "player",
      previewService,
      pages,
    });

    expect(await screen.findAllByText("soundmanD")).not.toHaveLength(0);
    expect(screen.getByText("Example:")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    expect(screen.getByText("Recent Series")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Viewer" }));
    expect(screen.getByRole("heading", { name: "Tracked Gameplay" })).toBeInTheDocument();
    const previewStage = screen.getByTestId("preview-stage");
    previewStage.scrollTop = 300;
    fireEvent.scroll(previewStage);
    const jumpToLatestButton = screen.getByRole("button", { name: "Jump to latest" });
    expect(jumpToLatestButton).toBeInTheDocument();
    expect(screen.getByTestId("preview-fixed-controls")).toContainElement(jumpToLatestButton);
    expect(previewStage).not.toContainElement(jumpToLatestButton);

    const matchEntries = await screen.findAllByRole("button", { name: /^Match .+ on / });
    const matchEntry = matchEntries.at(0);
    if (matchEntry === undefined) {
      throw new Error("Expected a viewer match entry");
    }
    await user.click(matchEntry);
    await waitFor(() => {
      expect(pages.getSeriesMatches).toHaveBeenCalledWith(expect.any(Array), undefined, undefined);
    });
  });

  it("shows an empty state instead of matchmaking UI when no series exists", async () => {
    const user = userEvent.setup();
    const previewService = aFakeOverlayPreviewServiceWith();
    const getPreview = previewService.getPreview.bind(previewService);
    vi.spyOn(previewService, "getPreview").mockImplementation(async (mode, settings) => {
      const response = await getPreview(mode, settings);
      return mode === "series"
        ? { ...response, view: { ...response.view, hasActiveSeries: false, series: [], matches: [] } }
        : response;
    });
    const pages = createPageComponents();

    renderCapabilityPreview({
      gamertag: null,
      isAuthenticated: false,
      previewMode: "observer",
      previewService,
      pages,
    });

    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    expect(await screen.findByText("No completed custom series found for this preview.")).toBeInTheDocument();
    expect(screen.queryByText("Matches Won/Loss")).not.toBeInTheDocument();
  });

  it("uses the shared error state and retries the selected preview mode", async () => {
    const user = userEvent.setup();
    const previewService = aFakeOverlayPreviewServiceWith();
    const getPreview = vi
      .spyOn(previewService, "getPreview")
      .mockImplementation(async (mode) =>
        Promise.reject(new Error(mode === "series" ? "Series unavailable" : "Matchmaking unavailable")),
      );
    const pages = createPageComponents();

    renderCapabilityPreview({
      gamertag: "343GuiltySpark",
      isAuthenticated: true,
      previewMode: "player",
      previewService,
      pages,
    });

    expect(await screen.findByRole("heading", { name: "Connection Failed" })).toBeInTheDocument();
    expect(screen.getByText("Matchmaking unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(getPreview).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    expect(await screen.findByText("Series unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(getPreview).toHaveBeenCalledTimes(4);
    });
    expect(getPreview).toHaveBeenLastCalledWith("series", undefined);

    await user.click(screen.getByRole("button", { name: "Viewer" }));
    expect(await screen.findByText("Matchmaking unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(getPreview).toHaveBeenCalledTimes(5);
    });
    expect(getPreview).toHaveBeenLastCalledWith("matchmaking", undefined);
  });

  it("starts with zoom disabled and toggles the zoom layer on demand", async () => {
    const user = userEvent.setup();
    const previewService = aFakeOverlayPreviewServiceWith();
    const pages = createPageComponents();

    renderCapabilityPreview({
      gamertag: "343GuiltySpark",
      isAuthenticated: false,
      previewMode: "player",
      previewService,
      pages,
    });

    const toggle = await screen.findByRole("button", { name: "Zoom preview" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveTextContent("Zoom off");
    expect(screen.queryByRole("group", { name: "Preview canvas" })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("Zoom on");
    expect(screen.getByRole("group", { name: "Preview canvas" })).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveTextContent("Zoom off");
  });

  it("places the zoom toggle before the preview canvas in DOM order", async () => {
    const previewService = aFakeOverlayPreviewServiceWith();
    const pages = createPageComponents();

    renderCapabilityPreview({
      gamertag: "343GuiltySpark",
      isAuthenticated: false,
      previewMode: "player",
      previewService,
      pages,
    });

    const toggle = await screen.findByRole("button", { name: "Zoom preview" });
    const stage = screen.getByTestId("preview-stage");

    expect(toggle.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
  });
});
