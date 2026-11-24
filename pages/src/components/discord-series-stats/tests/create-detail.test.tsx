import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  aFakeSeriesDetailResponseWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { createDiscordSeriesDetailStats } from "../create-detail";
import { DEFAULT_COLOR_SETTINGS, DEFAULT_SERIES_SETTINGS } from "../../live-tracker/settings/types";
import { aFakeSeriesDetailWithTeamSwap } from "../../series-stats/fakes/series-detail-team-swap.fake";

afterEach(() => {
  cleanup();
});

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): ReactNode => <div>Team {teamId.toString()}</div>,
}));

vi.mock("../../icons/medal-icon", () => ({
  MedalIcon: ({ medalName }: { medalName: string }): ReactNode => <div>{medalName}</div>,
}));

describe("DiscordSeriesDetailStats", () => {
  it("uses series context and score in the document title", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailResponseWith({
      context: { title: "Queue #7156 Series Stats", subtitle: "Dog Crew" },
      aggregation: {
        status: "resolved",
        gamesPlayed: 5,
        completedGameCount: 5,
        teams: [
          aFakeSeriesTeamWith({ seriesTeamId: 0, gamesWon: 3 }),
          aFakeSeriesTeamWith({
            seriesTeamId: 1,
            name: "Cobra",
            gamesWon: 2,
          }),
        ],
        players: [aFakeSeriesPlayerWith()],
      },
    });

    render(
      <DiscordSeriesStats
        data={data}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    expect(document.title).toBe("Queue #7156 (🦅3:2🐍) | Dog Crew Stats - Guilty Spark");
  });

  it("renders the shared series layout and its detail data", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailResponseWith({
      context: { title: "Queue #7777 Series Stats", subtitle: "Guild 123456789012345678" },
    });
    const onAnalyticsTabSelected = vi.fn<(module: AnalyticsModule, matchId?: string) => void>();

    render(
      <DiscordSeriesStats
        data={data}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={onAnalyticsTabSelected}
      />,
    );

    expect(screen.getByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
    expect(screen.getByText("Guild 123456789012345678")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matches" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Series Totals" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(onAnalyticsTabSelected).toHaveBeenCalledWith("scoreProgression", "match-one");
  });

  it("renders explicit warnings for unavailable match details and series aggregation", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailResponseWith({
      matches: { matchIds: ["missing"], results: [{ status: "unavailable", matchId: "missing", reason: "not-found" }] },
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });

    render(
      <DiscordSeriesStats
        data={data}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Series totals are unavailable because some match details could not be resolved."),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed to load detailed stats for match missing.")).toBeInTheDocument();
  });

  it("does not apply observer overrides when a match is missing", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailWithTeamSwap();
    const first = Preconditions.checkExists(data.matches.results[0]);
    render(
      <DiscordSeriesStats
        data={{
          ...data,
          matches: {
            matchIds: [first.matchId, "missing"],
            results: [first, { status: "unavailable", matchId: "missing", reason: "not-found" }],
          },
          aggregation: { status: "unavailable", reason: "incomplete-matches" },
        }}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={{ eagleColor: "jade", cobraColor: "sky" }}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load detailed stats for match missing.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Eagle" }).closest("section")).toHaveStyle("--team-color: #FE3939");
    fireEvent.click(screen.getByText("Team color settings"));
    expect(screen.queryByRole("button", { name: "Select First series team color" })).not.toBeInTheDocument();
  });
});
