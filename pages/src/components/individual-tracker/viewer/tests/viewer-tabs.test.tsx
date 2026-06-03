import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { buildViewerRenderModel } from "../viewer-render-model";
import { TabsBar } from "../viewer-tabs";

describe("TabsBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the score for a standalone match tab", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", score: "50:30" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<TabsBar timeline={timeline} />);

    expect(screen.getByText("50:30")).toBeInTheDocument();
  });

  it("renders the series title for a series tab", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", score: "1:1" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<TabsBar timeline={timeline} />);

    expect(screen.getByText("Ranked Series")).toBeInTheDocument();
  });

  it("renders the series score for a series tab", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", score: "2:1" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    render(<TabsBar timeline={timeline} />);

    expect(screen.getByText("2:1")).toBeInTheDocument();
  });

  it("renders the match title attribute with map name and score", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Aquarius", score: "50:30" })],
    });
    const { timeline } = buildViewerRenderModel({ view });

    const { container } = render(<TabsBar timeline={timeline} />);

    expect(container.querySelector('[title="Aquarius 50:30"]')).toBeInTheDocument();
  });
});
