import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <span data-testid={`team-icon-${teamId.toString()}`} />
  ),
}));
vi.mock("../../../icons/medal-icon", () => ({
  MedalIcon: (): React.ReactNode => null,
}));
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchStatsWith } from "../../../stats/fakes/data";
import { buildViewerRenderModel } from "../../viewer/viewer-render-model";
import { IndividualTrackerOverlay } from "../individual-tracker-overlay";

function aRenderModel(
  overrides?: Parameters<typeof aFakeTrackerViewStateWith>[0],
): ReturnType<typeof buildViewerRenderModel> {
  return buildViewerRenderModel({ view: aFakeTrackerViewStateWith(overrides) });
}

describe("IndividualTrackerOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without crashing when the timeline is empty", () => {
    const { container } = render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [], series: [] })}
        matchStatsState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders without crashing when the timeline has items", () => {
    const { container } = render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })] })}
        matchStatsState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("keeps the stats panel closed when a match is selected but stats are still loading", () => {
    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })] })}
        matchStatsState={{ status: "loading" }}
        selectedMatchId="m-1"
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("opens the stats panel when stats are loaded for a selected match", () => {
    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })] })}
        matchStatsState={{
          status: "loaded",
          stats: aFakeMatchStatsWith(),
          playerMap: new Map([
            ["1111111111", "Alpha"],
            ["2222222222", "Bravo"],
            ["3333333333", "Charlie"],
            ["4444444444", "Delta"],
          ]),
          medalMetadata: {},
        }}
        selectedMatchId="m-1"
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("opens the stats panel when stats fail to load so the error is visible", () => {
    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })] })}
        matchStatsState={{ status: "error", message: "Network failure" }}
        selectedMatchId="m-1"
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });

  it("calls onDeselect when the close button is clicked", async () => {
    const onDeselect = vi.fn();

    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({ matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })] })}
        matchStatsState={{
          status: "loaded",
          stats: aFakeMatchStatsWith(),
          playerMap: new Map([
            ["1111111111", "Alpha"],
            ["2222222222", "Bravo"],
            ["3333333333", "Charlie"],
            ["4444444444", "Delta"],
          ]),
          medalMetadata: {},
        }}
        selectedMatchId="m-1"
        onSelectMatch={() => undefined}
        onDeselect={onDeselect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onDeselect).toHaveBeenCalledOnce();
  });
});
