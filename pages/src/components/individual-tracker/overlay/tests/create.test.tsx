import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
  aFakeIndividualTrackerViewServiceWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { IndividualTrackerOverlayPage } from "../create";

vi.mock("../individual-tracker-overlay", () => ({
  IndividualTrackerOverlay: (props: {
    viewModel: object;
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
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-1" })],
      }),
    });

    const getMatchStats = vi.fn(
      async (): Promise<ReturnType<typeof aFakeMatchStatsWith>> =>
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

    render(
      <IndividualTrackerOverlayPage
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={matchAnalyticsService}
        seriesMatchesService={aFakeSeriesMatchesServiceWith()}
        haloClient={haloClient}
        trackerId="tracker-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("select")).toBeInTheDocument();
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

    expect(getMatchStats).toHaveBeenCalledTimes(1);
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

    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.reject(new Error("boom"))),
    });

    render(
      <IndividualTrackerOverlayPage
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={aFakeMatchAnalyticsServiceWith()}
        seriesMatchesService={aFakeSeriesMatchesServiceWith()}
        haloClient={haloClient}
        trackerId="tracker-1"
      />,
    );

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

    const getMatchStats = vi.fn(
      async (): Promise<ReturnType<typeof aFakeMatchStatsWith>> =>
        Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })),
    );
    const haloClient = aFakeHaloClientWith({ getMatchStats });

    const { rerender } = render(
      <IndividualTrackerOverlayPage
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={aFakeMatchAnalyticsServiceWith()}
        seriesMatchesService={aFakeSeriesMatchesServiceWith()}
        haloClient={haloClient}
        trackerId="tracker-1"
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

    rerender(
      <IndividualTrackerOverlayPage
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={aFakeMatchAnalyticsServiceWith()}
        seriesMatchesService={aFakeSeriesMatchesServiceWith()}
        haloClient={haloClient}
        trackerId="tracker-2"
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

    expect(getMatchStats).toHaveBeenCalledTimes(2);
  });
});
