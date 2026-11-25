import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { presentArchiveSeriesColors } from "../archive-series-colors";

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
  it("preserves both cards when duplicate team labels are edited", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const props = {
      data: aFakeSeriesDetailWithTeamSwap(),
      analyticsByMatchId: new Map(),
      viewMode: "wide" as const,
      observerColors: DEFAULT_COLOR_SETTINGS.observerView,
      onObserverColorsChange: vi.fn(),
      onSeriesSettingsChange: vi.fn(),
      onViewModeSelect: vi.fn(),
      onAnalyticsTabSelected: vi.fn(),
    };
    const consoleError = vi.spyOn(console, "error");
    const { rerender } = render(
      <DiscordSeriesStats
        {...props}
        seriesSettings={{ ...DEFAULT_SERIES_SETTINGS, eagleTeamNameOverride: "Same", cobraTeamNameOverride: "Same" }}
      />,
    );
    const headings = screen.getAllByRole("heading", { name: "Same" });
    const first = Preconditions.checkExists(headings[0]);
    const second = Preconditions.checkExists(headings[1]);
    expect(first.closest("section")).toHaveTextContent("Bravo");
    expect(second.closest("section")).toHaveTextContent("Alpha");
    expect(consoleError).not.toHaveBeenCalled();

    rerender(
      <DiscordSeriesStats
        {...props}
        seriesSettings={{ ...DEFAULT_SERIES_SETTINGS, eagleTeamNameOverride: "Renamed", cobraTeamNameOverride: "Same" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Renamed" })).toBe(first);
    expect(screen.getByRole("heading", { name: "Same" })).toBe(second);
    consoleError.mockRestore();
  });

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
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(screen.queryByRole("button", { name: "Select Eagle team color" })).not.toBeInTheDocument();
  });

  it.each([
    ["null", [0, null]],
    ["duplicate", [0, 0]],
    ["mismatched", [0, 42]],
    ["incomplete", [0]],
  ])("rejects %s match-team mappings even with resolved aggregation", (_label, ids) => {
    const data = aFakeSeriesDetailWithTeamSwap();
    const results = data.matches.results.map((result, index) =>
      result.status === "resolved" && index === 1
        ? {
            ...result,
            detail: {
              ...result.detail,
              teams: result.detail.teams.slice(0, ids.length).map((team, i) => ({
                ...team,
                seriesTeamId: ids[i] ?? null,
              })),
            },
          }
        : result,
    );
    expect(
      presentArchiveSeriesColors(
        { ...data, matches: { ...data.matches, results } },
        {
          eagleColor: "jade",
          cobraColor: "sky",
        },
      ),
    ).toEqual({ available: false, teamColors: [] });
  });

  it("shows the same fallback color in the picker and archive for an invalid observer color", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    render(
      <DiscordSeriesStats
        data={aFakeSeriesDetailWithTeamSwap()}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={{ eagleColor: "invalid", cobraColor: "invalid" }}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Eagle" }).closest("section")).toHaveStyle("--team-color: #FE3939");
    expect(screen.getByRole("heading", { name: "Cobra" }).closest("section")).toHaveStyle("--team-color: #3B9DFF");
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(screen.getByRole("button", { name: "Select Eagle team color" })).toHaveTextContent("Salmon");
    expect(screen.getByRole("button", { name: "Select Cobra team color" })).toHaveTextContent("Cerulean");
  });

  it("labels color controls with the corresponding overview team names", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailWithTeamSwap();
    if (data.aggregation.status !== "resolved") {
      throw new Error("Expected resolved series aggregation");
    }
    const teams = data.aggregation.teams.map((team) => ({
      ...team,
      name: team.seriesTeamId === 0 ? "Alpha" : "Bravo",
    }));
    const onObserverColorsChange = vi.fn<(updates: Partial<typeof DEFAULT_COLOR_SETTINGS.observerView>) => void>();
    const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      render(
        <DiscordSeriesStats
          data={{ ...data, aggregation: { ...data.aggregation, teams: teams.reverse() } }}
          analyticsByMatchId={new Map()}
          viewMode="wide"
          seriesSettings={DEFAULT_SERIES_SETTINGS}
          observerColors={DEFAULT_COLOR_SETTINGS.observerView}
          onObserverColorsChange={onObserverColorsChange}
          onSeriesSettingsChange={vi.fn()}
          onViewModeSelect={vi.fn()}
          onAnalyticsTabSelected={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Bravo" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
      fireEvent.click(screen.getByRole("button", { name: "Select Alpha team color" }));
      fireEvent.click(screen.getByRole("button", { name: "Jade" }));
      expect(onObserverColorsChange).toHaveBeenCalledWith({ eagleColor: "jade" });
      const secondPicker = screen.getByRole("button", { name: "Select Bravo team color" });
      fireEvent.click(secondPicker);
      fireEvent.click(
        within(Preconditions.checkExists(secondPicker.parentElement)).getByRole("button", { name: "Sky" }),
      );
      expect(onObserverColorsChange).toHaveBeenCalledWith({ cobraColor: "sky" });
    } finally {
      if (scrollDescriptor == null) {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
      }
    }
  });
});
