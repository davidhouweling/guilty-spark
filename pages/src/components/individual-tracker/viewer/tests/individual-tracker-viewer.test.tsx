import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { TrackerViewConnectionStatus } from "../../../../services/individual-tracker/view-types";
import { buildViewerRenderModel } from "../viewer-render-model";
import type { IndividualTrackerViewerRenderModel } from "../types";
import { IndividualTrackerViewer } from "../individual-tracker-viewer";

vi.mock("react-time-ago", () => ({
  default: ({ date }: { date: Date }): React.ReactNode => <span>{date.toISOString()}</span>,
}));

function aModel(view: ReturnType<typeof aFakeTrackerViewStateWith>): IndividualTrackerViewerRenderModel {
  return buildViewerRenderModel({ view });
}

function renderViewer(
  view: ReturnType<typeof aFakeTrackerViewStateWith>,
  connectionStatus: TrackerViewConnectionStatus = "connected",
  canManage = true,
): void {
  render(
    <IndividualTrackerViewer
      renderModel={aModel(view)}
      connectionStatus={connectionStatus}
      expandedEntryKeys={new Set()}
      entryStates={new Map()}
      canManage={canManage}
      refreshPending={false}
      onToggleEntry={() => undefined}
      onBackToManage={() => undefined}
      onRefresh={() => undefined}
    />,
  );
}

describe("IndividualTrackerViewer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the gamertag and active status", () => {
    const view = aFakeTrackerViewStateWith({
      gamertag: "Spartan One",
      isLive: false,
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m-1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-2", outcome: "Loss" }),
      ],
    });

    renderViewer(view);

    expect(screen.getByText("Spartan One Tracker")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a standalone match entry with its map and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Aquarius", score: "50:30" })],
    });

    renderViewer(view);

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
    expect(screen.getByText("50:30")).toBeInTheDocument();
    expect(screen.getByAltText("Slayer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /match/i })).toBeInTheDocument();
  });

  it("renders matches newest to oldest when the API returns newest first", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m-newest", mapName: "Newest" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-oldest", mapName: "Oldest" }),
      ],
    });

    renderViewer(view);

    const buttons = screen.getAllByRole("button", { name: /match/i });
    expect(buttons[0]).toHaveTextContent("Newest");
    expect(buttons[1]).toHaveTextContent("Oldest");
  });

  it("renders a series entry with title and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", score: "1:1" })],
    });

    renderViewer(view);

    expect(screen.getByText("Ranked Series")).toBeInTheDocument();
    expect(screen.getByText("1:1")).toBeInTheDocument();
    expect(screen.getByText("2 matches")).toBeInTheDocument();
  });

  it("renders a Live badge when the tracker is live", () => {
    const view = aFakeTrackerViewStateWith({ isLive: true });

    renderViewer(view);

    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders an empty state when there are no matches", () => {
    const view = aFakeTrackerViewStateWith({ matches: [], series: [] });

    renderViewer(view);

    expect(screen.getByText("No matches tracked yet.")).toBeInTheDocument();
  });

  it("renders a connection notice for non-connected states", () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "Spartan One" });

    renderViewer(view, "disconnected");

    expect(screen.getByTestId("connection-notice")).toHaveTextContent("Reconnecting...");
  });

  it("renders without crashing when timestamps are not valid dates", () => {
    const view = aFakeTrackerViewStateWith({
      gamertag: "Spartan One",
      lastUpdateTime: "",
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", startTime: "not-a-date" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1"], title: "Bad Dates" })],
    });

    renderViewer(view);

    expect(screen.getByText("Spartan One Tracker")).toBeInTheDocument();
    expect(screen.getByText("Last update: unknown | Next update: unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
  });

  it("hides manage actions when management is unavailable", () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "Spartan One" });

    renderViewer(view, "connected", false);

    expect(screen.queryByRole("button", { name: "Back to manager" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
});
