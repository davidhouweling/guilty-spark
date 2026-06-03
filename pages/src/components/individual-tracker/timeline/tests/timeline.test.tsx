import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { buildViewerRenderModel } from "../../viewer/viewer-render-model";
import { Timeline } from "../timeline";

describe("Timeline", () => {
  afterEach(() => {
    cleanup();
  });

  it('shows "No matches tracked yet." when there are no timeline items', () => {
    const view = aFakeTrackerViewStateWith({ matches: [], series: [] });
    const { timeline } = buildViewerRenderModel({ view });

    render(<Timeline timeline={timeline} />);

    expect(screen.getByText("No matches tracked yet.")).toBeInTheDocument();
  });

  it("renders a standalone match card with its map name and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Aquarius", score: "50:30" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<Timeline timeline={timeline} />);

    const card = screen.getByTestId("match-card");
    expect(card).toHaveTextContent("Aquarius");
    expect(card).toHaveTextContent("50:30");
  });

  it("renders a series card with its title and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", score: "1:1" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<Timeline timeline={timeline} />);

    const card = screen.getByTestId("series-card");
    expect(card).toHaveTextContent("Ranked Series");
    expect(card).toHaveTextContent("1:1");
  });

  it("renders member match cards inside a series card", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"] })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<Timeline timeline={timeline} />);

    expect(screen.getAllByTestId("match-card")).toHaveLength(2);
  });
});
