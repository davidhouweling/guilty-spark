import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
  aFakeIndividualTrackerViewServiceWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/series-matches/fakes/series-matches.fake";
import { createIndividualTrackerOverlayPage } from "../create";

vi.mock("../individual-tracker-overlay", () => ({
  IndividualTrackerOverlay: (props: {
    viewModel: {
      tickerMatchGroups: readonly { label: string; rows: readonly { name: string | null }[] }[];
    };
    isPanelOpen: boolean;
    matchesLength: number;
    selectedMatchId: string | null;
    selectedSeriesId: string | null;
    matchStatsPanelState: { status: string } | null;
    seriesStatsPanelState: { status: string } | null;
    onSelectMatch: (matchId: string) => void;
    onSelectSeries: (seriesId: string) => void;
    onDeselect: () => void;
  }): React.ReactElement => {
    return (
      <div>
        <div data-testid="has-view-model">yes</div>
        <div data-testid="panel-open">{props.isPanelOpen ? "yes" : "no"}</div>
        <div data-testid="matches-length">{props.matchesLength.toString()}</div>
        <div data-testid="selected-match">{props.selectedMatchId ?? "none"}</div>
        <div data-testid="selected-series">{props.selectedSeriesId ?? "none"}</div>
        <div data-testid="panel-state">{props.matchStatsPanelState?.status ?? "none"}</div>
        <div data-testid="ticker-players">
          {props.viewModel.tickerMatchGroups.flatMap((group) => group.rows.map((row) => row.name)).join(",")}
        </div>
        <div data-testid="ticker-data">{JSON.stringify(props.viewModel.tickerMatchGroups)}</div>
        <button
          type="button"
          onClick={(): void => {
            props.onSelectMatch("match-1");
          }}
        >
          select
        </button>
        <button type="button" onClick={props.onDeselect}>
          deselect
        </button>
      </div>
    );
  },
}));

describe("IndividualTrackerOverlayPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads match stats on select and reuses cached state", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: {
        ...aFakeTrackerViewStateWith({
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
        }),
        streamerSettings: { styleFlags: { matchmakingMyStatsOnly: true, medalRarityFilter: [0] } },
      },
    });

    const getMatchStats = vi.fn(async (): Promise<ReturnType<typeof aFakeMatchStatsWith>> =>
      Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })),
    );
    const getUsers = vi.fn(async (xuids: string[]) =>
      Promise.resolve(
        xuids.map((xuid) => ({
          xuid,
          gamertag: xuid,
          gamerpic: { small: "", medium: "", large: "", xlarge: "" },
        })),
      ),
    );
    const haloClient = aFakeHaloClientWith({ getMatchStats, getUsers });

    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    const getBatchMatchAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getMatchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
    const IndividualTrackerOverlayPage = createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService,
      seriesMatchesService,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    });

    render(<IndividualTrackerOverlayPage trackerId="tracker-1" />);

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
      expect(screen.getByTestId("ticker-players")).toHaveTextContent("Spartan One");
      expect(screen.getByTestId("ticker-data")).toHaveTextContent("Kills");
      expect(screen.getByTestId("ticker-data")).toHaveTextContent("Double Kill");
      expect(screen.getByTestId("ticker-data")).not.toHaveTextContent('"type":"team"');
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("has-view-model")).toHaveTextContent("yes");
      expect(screen.getByTestId("selected-match")).toHaveTextContent("match-1");
      expect(screen.getByTestId("panel-open")).toHaveTextContent("yes");
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    await userEvent.click(screen.getByText("deselect"));
    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-match")).toHaveTextContent("match-1");
      expect(screen.getByTestId("panel-open")).toHaveTextContent("yes");
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    expect(getMatchStats).not.toHaveBeenCalled();
    expect(getMatchDetails).toHaveBeenCalledTimes(1);
    expect(getMatchDetails).toHaveBeenCalledWith(["match-1"], "tracker-1");
    expect(getBatchMatchAnalytics).toHaveBeenCalledTimes(1);
  });

  it("maps failed match load to error states", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
      }),
    });

    const haloClient = aFakeHaloClientWith();
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    vi.spyOn(seriesMatchesService, "getMatchDetails").mockRejectedValue(new Error("boom"));
    const IndividualTrackerOverlayPage = createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    });

    render(<IndividualTrackerOverlayPage trackerId="tracker-1" />);

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-match")).toHaveTextContent("match-1");
      expect(screen.getByTestId("panel-open")).toHaveTextContent("yes");
      expect(screen.getByTestId("panel-state")).toHaveTextContent("error");
    });
  });

  it("loads again after tracker id changes", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
      }),
    });

    const getMatchStats = vi.fn(async (): Promise<ReturnType<typeof aFakeMatchStatsWith>> =>
      Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })),
    );
    const haloClient = aFakeHaloClientWith({ getMatchStats });
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getMatchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
    const IndividualTrackerOverlayPage = createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    });

    const { rerender } = render(<IndividualTrackerOverlayPage trackerId="tracker-1" />);

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("panel-open")).toHaveTextContent("yes");
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    rerender(
      <IndividualTrackerOverlayPage
        trackerId="tracker-2"
        externalView={aFakeTrackerViewStateWith({
          trackerId: "tracker-2",
          status: "active",
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("panel-open")).toHaveTextContent("yes");
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    expect(getMatchStats).not.toHaveBeenCalled();
    expect(getMatchDetails).toHaveBeenCalledTimes(2);
    expect(getMatchDetails).toHaveBeenLastCalledWith(["match-1"], "tracker-2");
  });

  it("loads match stats after remounting the created component", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
      }),
    });
    const getMatchStats = vi.fn(async (): Promise<ReturnType<typeof aFakeMatchStatsWith>> =>
      Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })),
    );
    const haloClient = aFakeHaloClientWith({ getMatchStats });
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getMatchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
    const IndividualTrackerOverlayPage = createIndividualTrackerOverlayPage({
      individualTrackerViewService,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    });

    const { rerender } = render(<IndividualTrackerOverlayPage key="first" trackerId="tracker-1" />);

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    rerender(<IndividualTrackerOverlayPage key="second" trackerId="tracker-1" />);

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(screen.getByTestId("panel-state")).toHaveTextContent("loaded");
    });

    expect(getMatchStats).not.toHaveBeenCalled();
    expect(getMatchDetails).toHaveBeenCalledTimes(2);
  });
});
