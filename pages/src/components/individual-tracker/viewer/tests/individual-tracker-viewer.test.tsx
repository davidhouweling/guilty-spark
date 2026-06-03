import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { buildViewerRenderModel } from "../viewer-render-model";
import type { IndividualTrackerViewerRenderModel } from "../types";
import { IndividualTrackerViewer } from "../individual-tracker-viewer";

function aModel(view: ReturnType<typeof aFakeTrackerViewStateWith>): IndividualTrackerViewerRenderModel {
  return buildViewerRenderModel({ view });
}

describe("IndividualTrackerViewer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the gamertag and accumulated record", () => {
    const view = aFakeTrackerViewStateWith({
      gamertag: "Spartan One",
      isLive: false,
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m-1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-2", outcome: "Loss" }),
      ],
    });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("Spartan One")).toBeInTheDocument();
    expect(screen.getByTestId("record")).toHaveTextContent("1:1");
  });

  it("renders a standalone match card with its map and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Aquarius", score: "50:30" })],
    });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    const card = screen.getByTestId("match-card");
    expect(card).toHaveTextContent("Aquarius");
    expect(card).toHaveTextContent("50:30");
  });

  it("renders a series group card with its title, score, and member matches", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", score: "1:1" })],
    });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    const card = screen.getByTestId("series-card");
    expect(card).toHaveTextContent("Ranked Series");
    expect(card).toHaveTextContent("1:1");
    expect(screen.getAllByTestId("match-card")).toHaveLength(2);
  });

  it("renders a Live badge when the tracker is live", () => {
    const view = aFakeTrackerViewStateWith({ isLive: true });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders an empty state when there are no matches", () => {
    const view = aFakeTrackerViewStateWith({ matches: [], series: [] });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("No matches tracked yet.")).toBeInTheDocument();
  });

  it("renders a connection notice for non-connected states", () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "Spartan One" });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="disconnected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByTestId("connection-notice")).toHaveTextContent("Reconnecting...");
  });

  it("renders without crashing when timestamps are not valid dates", () => {
    const view = aFakeTrackerViewStateWith({
      gamertag: "Spartan One",
      lastUpdateTime: "",
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", startTime: "not-a-date" })],
    });

    render(
      <IndividualTrackerViewer
        renderModel={aModel(view)}
        connectionStatus="connected"
        selectedMatchId={null}
        matchStatsState={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("Spartan One")).toBeInTheDocument();
    expect(screen.getByText("Last updated unknown")).toBeInTheDocument();
  });
});
