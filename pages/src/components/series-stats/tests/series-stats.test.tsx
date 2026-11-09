import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
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
  it("requests only selected analytics and forwards match identity for match-level tabs", () => {
    const onAnalyticsTabSelected = vi.fn<(module: AnalyticsModule, matchId?: string) => void>();
    const viewModel = new SeriesDetailStatsViewModelPresenter().present(aFakeSeriesDetailResponseWith());

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
