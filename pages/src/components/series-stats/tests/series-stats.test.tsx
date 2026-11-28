import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { SeriesDetailStatsViewModelPresenter } from "../series-detail-stats-view-model-presenter";
import { SeriesStatsView } from "../series-stats";

afterEach(() => {
  cleanup();
});

vi.mock("../../stats/score-progression/create", () => ({
  createScoreProgression: (): (() => ReactNode) => (): ReactNode => <div>Score Progression Chart</div>,
}));

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): ReactNode => <div>Team {teamId.toString()}</div>,
}));

vi.mock("../../icons/medal-icon", () => ({
  MedalIcon: ({ medalName }: { medalName: string }): ReactNode => <div>{medalName}</div>,
}));

describe("SeriesStatsView analytics selection", () => {
  it.each([
    ["non-archive", false, 1],
    ["missing identity", true, null],
  ])("retains name-keyed cards for %s data", (_label, useStableTeamCardKeys, seriesTeamId) => {
    const presenter = new SeriesDetailStatsViewModelPresenter(new StatsDetailController());
    const model = presenter.present(aFakeSeriesDetailResponseWith());
    const team = { seriesTeamId, name: "Original", players: [], teamColorHex: "#FE3939" };
    const { rerender } = render(
      <SeriesStatsView {...model} teams={[team]} useStableTeamCardKeys={useStableTeamCardKeys} />,
    );
    const original = screen.getByRole("heading", { name: "Original" });

    rerender(
      <SeriesStatsView
        {...model}
        teams={[{ ...team, name: "Renamed" }]}
        useStableTeamCardKeys={useStableTeamCardKeys}
      />,
    );
    expect(screen.getByRole("heading", { name: "Renamed" })).not.toBe(original);
  });

  it("places contextual content by match identity and after the final match", () => {
    const presenter = new SeriesDetailStatsViewModelPresenter(new StatsDetailController());
    const viewModel = presenter.present(
      aFakeSeriesDetailResponseWith({
        matches: {
          matchIds: ["second", "first"],
          results: ["second", "first"].map((matchId) => ({
            status: "resolved",
            matchId,
            detail: aFakeMatchDetailWith({ matchId }),
          })),
        },
      }),
    );
    render(
      <SeriesStatsView
        {...viewModel}
        beforeMatchContent={
          new Map([
            ["first", <p key="first">Before first</p>],
            ["second", <p key="second">Before second</p>],
          ])
        }
        afterMatchesContent={<p>After matches</p>}
      />,
    );
    const first = Preconditions.checkExists(document.getElementById("first"));
    const second = Preconditions.checkExists(document.getElementById("second"));
    expect(screen.getByText("Before second").compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(second.compareDocumentPosition(screen.getByText("Before first"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Before first").compareDocumentPosition(first)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(first.compareDocumentPosition(screen.getByText("After matches"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("requests only selected analytics and forwards match identity for match-level tabs", () => {
    const onAnalyticsTabSelected = vi.fn<(module: AnalyticsModule, matchId?: string) => void>();
    const presenter = new SeriesDetailStatsViewModelPresenter(new StatsDetailController());
    const viewModel = presenter.present(aFakeSeriesDetailResponseWith());

    render(<SeriesStatsView {...viewModel} showSeriesTitle={false} onAnalyticsTabSelected={onAnalyticsTabSelected} />);

    expect(onAnalyticsTabSelected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(onAnalyticsTabSelected).toHaveBeenLastCalledWith("scoreProgression", "match-one");

    const killMatrixTabs = screen.getAllByRole("tab", { name: "Kill Matrix" });
    fireEvent.click(Preconditions.checkExists(killMatrixTabs[1], "match kill matrix tab"));
    expect(onAnalyticsTabSelected).toHaveBeenLastCalledWith("killMatrix", "match-one");

    fireEvent.click(Preconditions.checkExists(killMatrixTabs[0], "series kill matrix tab"));
    expect(onAnalyticsTabSelected).toHaveBeenLastCalledWith("killMatrix");
    expect(onAnalyticsTabSelected).toHaveBeenCalledTimes(3);
  });
});
