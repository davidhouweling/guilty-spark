import "@testing-library/jest-dom/vitest";

import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { aFakeFollowLiveServiceWith } from "../../../../services/follow/fakes/follow.fake";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeOverlayPreviewServiceWith } from "../../../../services/individual-tracker/fakes/overlay-preview.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../../services/individual-tracker/fakes/view.fake";
import type { IndividualTrackerService } from "../../../../services/individual-tracker/types";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import type { OverlayPreviewService } from "../../../../services/individual-tracker/overlay-preview-types";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../../services/stats/series-matches-types";
import { createFollowLiveOverlay } from "../../../follow/follow-live-overlay/create";
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

function createPageComponents(directory = aDirectoryWith()): {
  readonly OverlayPage: ReturnType<typeof createIndividualTrackerOverlayPage>;
  readonly LiveOverlayPage: ReturnType<typeof createFollowLiveOverlay>;
  readonly ViewerPage: ReturnType<typeof createIndividualTrackerViewerPage>;
  readonly getSeriesMatches: MockInstance<SeriesMatchesService["getSeriesMatches"]>;
  readonly getDirectory: MockInstance<ReturnType<typeof aFakeFollowLiveServiceWith>["getDirectory"]>;
  readonly followLiveService: ReturnType<typeof aFakeFollowLiveServiceWith>;
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
  const followLiveService = aFakeFollowLiveServiceWith({ directory });
  const getDirectory = vi.spyOn(followLiveService, "getDirectory");

  return {
    OverlayPage: createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService,
      seriesMatchesService,
      haloClient,
      medalMetadataResolver,
    }),
    LiveOverlayPage: createFollowLiveOverlay({
      followLiveService,
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
    getDirectory,
    followLiveService,
  };
}

interface RenderPreviewOptions {
  readonly gamertag: string | null;
  readonly isAuthenticated: boolean;
  readonly previewMode: "player" | "observer";
  readonly previewService: OverlayPreviewService;
  readonly directory?: TrackerDirectory | undefined;
  readonly individualTrackerService?: IndividualTrackerService | undefined;
  readonly xboxXuid?: string | null | undefined;
  readonly pages: ReturnType<typeof createPageComponents>;
}

function renderCapabilityPreview(options: RenderPreviewOptions): void {
  const store = new CapabilityPreviewStore();
  const presenter = new CapabilityPreviewPresenter({
    previewService: options.previewService,
    followLiveService: options.pages.followLiveService,
    individualTrackerService: options.individualTrackerService ?? aFakeIndividualTrackerServiceWith(),
    store,
  });
  if (options.directory !== undefined && options.isAuthenticated && options.gamertag != null) {
    presenter.loadDirectory(options.gamertag);
  }
  const identityKey = options.isAuthenticated ? `authenticated:${options.gamertag ?? ""}` : "demo";
  const activateMode = (tab: CapabilityPreviewTab): void => {
    if (tab === "live") {
      return;
    }
    presenter.load(tab === "viewer" ? "matchmaking" : tab, undefined, identityKey);
  };
  const CapabilityPreview = createCapabilityPreview(options.pages);
  render(
    <CapabilityPreview
      presenter={presenter}
      identityKey={identityKey}
      settingsReady
      gamertag={options.gamertag}
      xboxXuid={options.xboxXuid ?? null}
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
  it("hides Live from signed-out visitors", () => {
    renderCapabilityPreview({
      gamertag: "soundmanD",
      isAuthenticated: false,
      previewMode: "player",
      previewService: aFakeOverlayPreviewServiceWith(),
      pages: createPageComponents(),
    });
    expect(screen.queryByRole("button", { name: "Live overlay" })).not.toBeInTheDocument();
    expect(
      Array.from(screen.getByLabelText("Preview capability").querySelectorAll("button"), (tab) => tab.textContent),
    ).toEqual(["Series overlay", "Matchmaking overlay", "Viewer"]);
    expect(screen.getByText(/previews are indicative/i)).toBeInTheDocument();
  });

  it("selects the actual live overlay when the directory reports a live tracker", async () => {
    const pages = createPageComponents();
    renderCapabilityPreview({
      gamertag: "Spartan One",
      isAuthenticated: true,
      previewMode: "player",
      directory: aDirectoryWith(),
      previewService: aFakeOverlayPreviewServiceWith(),
      pages,
    });
    expect(await screen.findByText(/Live shows your current tracking session/)).toBeInTheDocument();
    const liveTab = screen.getByRole("button", { name: "Live overlay, live" });
    expect(liveTab.querySelector('[class*="liveDotActive"]')).not.toBeNull();
    expect(
      Array.from(screen.getByLabelText("Preview capability").querySelectorAll("button"), (tab) => tab.textContent),
    ).toEqual(["Series overlay", "Matchmaking overlay", "Viewer", "Live overlay, live"]);
    expect(await screen.findByAltText("Connection healthy")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Series overlay" }));
    const liveDot = liveTab.querySelector('[class*="liveDot"]');
    expect(liveDot?.className).toContain("liveDotActive");
    await waitFor(() => {
      expect(pages.followLiveService.lastConnection).not.toBeNull();
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      pages.followLiveService.lastConnection?.emitDirectory(
        aDirectoryWith({
          trackers: [aTrackerWith({ trackerId: "tracker-1", isLive: false, status: "active" })],
          liveTrackerId: "tracker-1",
        }),
      );
    });
    await waitFor(() => {
      expect(liveDot?.className).not.toContain("liveDotActive");
    });
    expect(liveTab).toHaveAccessibleName("Live overlay, offline");
  });

  it("does not mount the Live overlay while another preview tab is selected", async () => {
    const user = userEvent.setup();
    const directory = aDirectoryWith({ trackers: [], liveTrackerId: null });
    const pages = createPageComponents(directory);
    const { getDirectory } = pages;

    renderCapabilityPreview({
      gamertag: "Spartan One",
      isAuthenticated: true,
      previewMode: "player",
      directory,
      previewService: aFakeOverlayPreviewServiceWith(),
      pages,
    });

    await user.click(await screen.findByRole("button", { name: "Series overlay" }));
    await user.click(screen.getByRole("button", { name: "Viewer" }));
    await screen.findByRole("heading", { name: "Tracked Gameplay" });

    expect(getDirectory).toHaveBeenCalledOnce();
  });

  it("shows the signed-in user's live tracker and leaves start explicit when no tracker exists", async () => {
    const user = userEvent.setup();
    const directory = aDirectoryWith({ trackers: [], liveTrackerId: null });
    const pages = createPageComponents(directory);
    const individualTrackerService = aFakeIndividualTrackerServiceWith();
    const startTracker = vi.spyOn(individualTrackerService, "startTracker");
    renderCapabilityPreview({
      gamertag: "Spartan One",
      xboxXuid: "my-xuid",
      isAuthenticated: true,
      previewMode: "player",
      directory,
      individualTrackerService,
      previewService: aFakeOverlayPreviewServiceWith(),
      pages,
    });
    const liveTab = screen.getByRole("button", { name: "Live overlay, offline" });
    await user.click(liveTab);
    expect(await screen.findByText("No live tracker is running.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start tracker" })).toBeEnabled();
    expect(liveTab.querySelector('[class*="liveDotActive"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Zoom preview" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-stage")).not.toBeInTheDocument();
    expect(screen.queryByText(/Shown to scale/)).not.toBeInTheDocument();
    const manageLink = screen.getByRole("link", { name: "Manage trackers" });
    expect(manageLink).toHaveAttribute("href", "/individual-tracker");
    expect(manageLink.className).toContain("btnSecondary");
    expect(manageLink.closest('[class*="previewFrame"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Start tracker" }));
    await waitFor(() => {
      expect(startTracker).toHaveBeenCalledWith({ gamertag: "Spartan One", xuid: "my-xuid" });
    });

    expect(screen.queryByText("No active tracker — waiting for a live game")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    act(() => {
      pages.followLiveService.lastConnection?.emitDirectory(aDirectoryWith());
    });
    await waitFor(() => {
      expect(liveTab.querySelector('[class*="liveDotActive"]')).not.toBeNull();
    });
    expect(screen.getByRole("button", { name: "Series overlay" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("preview-stage")).toBeInTheDocument();
    expect(screen.queryByText("No live tracker is running.")).not.toBeInTheDocument();
  });

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
    const directory = aDirectoryWith({ trackers: [], liveTrackerId: null });
    const previewService = aFakeOverlayPreviewServiceWith();
    const getPreview = vi
      .spyOn(previewService, "getPreview")
      .mockImplementation(async (mode) =>
        Promise.reject(new Error(mode === "series" ? "Series unavailable" : "Matchmaking unavailable")),
      );
    const pages = createPageComponents(directory);

    renderCapabilityPreview({
      gamertag: "343GuiltySpark",
      isAuthenticated: true,
      previewMode: "player",
      previewService,
      directory,
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
