import "@testing-library/jest-dom/vitest";

import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OverlayPreviewResponse } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import { aFakeOverlayPreviewServiceWith } from "../../../services/individual-tracker/fakes/overlay-preview.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../services/individual-tracker/fakes/view.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/stats/fakes/series-matches.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { createIndividualTrackerOverlayPage } from "../../individual-tracker/overlay/create";
import { createIndividualTrackerViewerPage } from "../../individual-tracker/viewer/create";
import { CapabilityPreview } from "../capability-preview";
import type { CapabilityPreviewProps } from "../capability-preview";
import type { CapabilityPreviewModeSnapshot } from "../capability-preview-store";

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <span data-testid={`team-icon-${teamId.toString()}`} />
  ),
}));

function createPageComponents(): Pick<CapabilityPreviewProps, "OverlayPage" | "ViewerPage"> & {
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

function aLoadedPreview(response: OverlayPreviewResponse): CapabilityPreviewModeSnapshot {
  return { status: "loaded", data: response, errorMessage: null };
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
    const [matchmaking, series] = await Promise.all([
      previewService.getPreview("matchmaking"),
      previewService.getPreview("series"),
    ]);
    const pages = createPageComponents();

    render(
      <CapabilityPreview
        gamertag="343GuiltySpark"
        isAuthenticated={false}
        previewMode="player"
        streamerSettings={undefined}
        matchmaking={aLoadedPreview(matchmaking)}
        series={aLoadedPreview(series)}
        OverlayPage={pages.OverlayPage}
        ViewerPage={pages.ViewerPage}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByText("soundmanD").length).toBeGreaterThan(0);
    expect(screen.getByText("Example:")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    expect(screen.getByText("Recent Series")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Viewer" }));
    expect(screen.getByRole("heading", { name: "Tracked Gameplay" })).toBeInTheDocument();

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
    const [matchmaking, series] = await Promise.all([
      previewService.getPreview("matchmaking"),
      previewService.getPreview("series"),
    ]);
    const noSeries = {
      ...series,
      view: { ...series.view, hasActiveSeries: false, series: [], matches: [] },
    };
    const pages = createPageComponents();

    render(
      <CapabilityPreview
        gamertag={null}
        isAuthenticated={false}
        previewMode="observer"
        streamerSettings={undefined}
        matchmaking={aLoadedPreview(matchmaking)}
        series={aLoadedPreview(noSeries)}
        OverlayPage={pages.OverlayPage}
        ViewerPage={pages.ViewerPage}
        onRetry={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Series overlay" }));
    expect(screen.getByText("No completed custom series found for this preview.")).toBeInTheDocument();
    expect(screen.queryByText("Matches Won/Loss")).not.toBeInTheDocument();
  });
});
