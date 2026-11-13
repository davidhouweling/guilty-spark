import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import { createSeriesStatsContent } from "../create";
import type { SeriesStatsContentProps } from "../types";

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

function viewerPropsWith(overrides: Partial<SeriesStatsContentProps> = {}): SeriesStatsContentProps {
  return {
    data: aFakeSeriesDetailResponseWith(),
    analyticsByMatchId: new Map(),
    showSeriesTitle: true,
    showSeriesOverview: false,
    noGutter: true,
    wide: true,
    onAnalyticsTabSelected: vi.fn<(module: AnalyticsModule, matchId?: string) => void>(),
    ...overrides,
  };
}

function teamRowColors(): string[] {
  const table = screen.getByRole("table", { name: "Accumulated team statistics" });
  return [...table.querySelectorAll<HTMLElement>("tbody tr")].map((row) => row.style.getPropertyValue("--row-color"));
}

describe("createSeriesStatsContent", () => {
  it("renders series totals and matches with viewer framing and forwards analytics selection", () => {
    const SeriesStatsContent = createSeriesStatsContent();
    const onAnalyticsTabSelected = vi.fn<(module: AnalyticsModule, matchId?: string) => void>();

    render(<SeriesStatsContent {...viewerPropsWith({ onAnalyticsTabSelected })} />);

    expect(screen.queryByRole("heading", { name: "Series overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Series Totals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matches" })).toBeInTheDocument();
    expect(teamRowColors()).toEqual(["#FE3939"]);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(onAnalyticsTabSelected).toHaveBeenCalledWith("scoreProgression", "match-one");
  });

  it("renders supplied team colors and updates when they change", () => {
    const SeriesStatsContent = createSeriesStatsContent();
    const props = viewerPropsWith({ teamColors: [getTeamColorOrDefault("jade", 0)] });

    const { rerender } = render(<SeriesStatsContent {...props} />);
    expect(teamRowColors()).toEqual(["#8AFFBE"]);

    rerender(<SeriesStatsContent {...props} teamColors={[getTeamColorOrDefault("mint", 0)]} />);
    expect(teamRowColors()).toEqual(["#23ED7D"]);
  });

  it("renders fresh content after unmount and remount of the same factory component", () => {
    const SeriesStatsContent = createSeriesStatsContent();
    const first = render(
      <SeriesStatsContent {...viewerPropsWith({ teamColors: [getTeamColorOrDefault("jade", 0)] })} />,
    );
    expect(teamRowColors()).toEqual(["#8AFFBE"]);
    first.unmount();

    render(<SeriesStatsContent {...viewerPropsWith()} />);

    expect(teamRowColors()).toEqual(["#FE3939"]);
    expect(screen.getAllByRole("heading", { name: "Series Totals" })).toHaveLength(1);
  });
});
