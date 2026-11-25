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
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { createDiscordSeriesDetailStats } from "../create-detail";
import { ArchiveSeriesOverlayPresenter } from "../archive-series-overlay-presenter";
import { SeriesDetailStatsViewModelPresenter } from "../../series-stats/series-detail-stats-view-model-presenter";
import overlayStyles from "../../streamer-overlay/streamer-overlay.module.css";
import {
  DEFAULT_ALL_SETTINGS,
  DEFAULT_COLOR_SETTINGS,
  DEFAULT_SERIES_SETTINGS,
} from "../../live-tracker/settings/types";
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

vi.mock("../../scrolling-content/scrolling-content", () => ({
  ScrollingContent: ({
    children,
    onScrollComplete,
  }: {
    children: ReactNode;
    onScrollComplete: () => void;
  }): ReactNode => (
    <div>
      {children}
      <button onClick={onScrollComplete}>Next ticker row</button>
    </div>
  ),
}));

function renderArchiveTicker(): void {
  const data = aFakeSeriesDetailWithTeamSwap();
  const teams = [
    aFakeSeriesTeamWith({ seriesTeamId: 7, name: "Cobra", playerIds: ["sub", "bot", "unknown"] }),
    aFakeSeriesTeamWith({ seriesTeamId: 2, name: "Eagle", playerIds: ["full"] }),
  ];
  const player = (
    playerId: string,
    gamertag: string | null,
    playerType: number,
    teamId: number,
    gamesPlayed: number,
  ): ReturnType<typeof aFakeSeriesPlayerWith> =>
    aFakeSeriesPlayerWith({
      playerId,
      gamertag,
      playerType,
      teamStats: [{ seriesTeamId: teamId, gamesPlayed, stats: [], medals: [] }],
    });
  const DiscordSeriesStats = createDiscordSeriesDetailStats();
  render(
    <DiscordSeriesStats
      data={{
        ...data,
        matches: {
          ...data.matches,
          results: data.matches.results.map((result) =>
            result.status !== "resolved"
              ? result
              : {
                  ...result,
                  detail: {
                    ...result.detail,
                    teams: result.detail.teams.map((team) => ({
                      ...team,
                      seriesTeamId: team.seriesTeamId === 0 ? 2 : 7,
                    })),
                  },
                },
          ),
        },
        aggregation: {
          status: "resolved",
          gamesPlayed: 2,
          completedGameCount: 2,
          teams,
          players: [
            player("sub", "Substitute", 1, 7, 1),
            player("bot", "Hidden bot name", 2, 7, 1),
            player("unknown", null, 1, 7, 1),
            player("full", "Full Player", 1, 2, 2),
          ],
        },
      }}
      analyticsByMatchId={new Map()}
      viewMode="streamer"
      streamerSettings={{ ...DEFAULT_ALL_SETTINGS, global: { ...DEFAULT_ALL_SETTINGS.global, viewMode: "streamer" } }}
      seriesSettings={DEFAULT_SERIES_SETTINGS}
      observerColors={{ eagleColor: "jade", cobraColor: "sky" }}
      onObserverColorsChange={vi.fn()}
      onSeriesSettingsChange={vi.fn()}
      onViewModeSelect={vi.fn()}
      onAnalyticsTabSelected={vi.fn()}
    />,
  );
}

describe("DiscordSeriesDetailStats", () => {
  it("uses stable team identities for rendered ticker colors despite reversed aggregation order", () => {
    renderArchiveTicker();
    const ticker = Preconditions.checkExists(screen.getByText("Series Stats").closest('[style*="--row-color"]'));
    expect(ticker).toHaveTextContent("Cobra");
    expect(ticker).toHaveStyle("--row-color: #49B8FE");
    fireEvent.click(screen.getByRole("button", { name: "Next ticker row" }));
    expect(ticker).toHaveTextContent("Eagle");
    expect(ticker).toHaveStyle("--row-color: #8AFFBE");
    fireEvent.click(screen.getByRole("button", { name: "Next ticker row" }));
    expect(ticker).toHaveTextContent("Substitute");
    expect(ticker).toHaveStyle("--row-color: #49B8FE");
  });

  it("renders partial-series suffixes and preserves bot and unknown player labels", () => {
    renderArchiveTicker();
    const next = screen.getByRole("button", { name: "Next ticker row" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByText("Substitute (1/2 games)")).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText("Bot (1/2 games)")).toBeInTheDocument();
    expect(screen.queryByText("Hidden bot name")).not.toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText("*Unknown* (1/2 games)")).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText("Full Player")).toBeInTheDocument();
  });

  it("keeps exactly two stable team cards through duplicate and distinct labels", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const props = {
      data: aFakeSeriesDetailWithTeamSwap(),
      analyticsByMatchId: new Map(),
      viewMode: "wide" as const,
      streamerSettings: DEFAULT_ALL_SETTINGS,
      observerColors: DEFAULT_COLOR_SETTINGS.observerView,
      onObserverColorsChange: vi.fn(),
      onSeriesSettingsChange: vi.fn(),
      onViewPreviewChange: vi.fn(),
      onViewModeSelect: vi.fn(),
      onAnalyticsTabSelected: vi.fn(),
    };
    const settings = (first: string): typeof DEFAULT_SERIES_SETTINGS => ({
      ...DEFAULT_SERIES_SETTINGS,
      eagleTeamNameOverride: first,
      cobraTeamNameOverride: "B",
    });
    const { rerender } = render(<DiscordSeriesStats {...props} seriesSettings={settings("A")} />);
    const first = screen.getByRole("heading", { name: "A" });
    const second = screen.getByRole("heading", { name: "B" });
    const overview = Preconditions.checkExists(first.closest("section")?.parentElement);

    function expectCards(names: readonly string[]): void {
      const headings = within(overview).getAllByRole("heading", { level: 3 }).slice(1);
      expect(headings.map((heading) => heading.textContent)).toEqual(names);
      expect(
        within(Preconditions.checkExists(Preconditions.checkExists(headings[0]).closest("section")))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Bravo"]);
      expect(
        within(Preconditions.checkExists(Preconditions.checkExists(headings[1]).closest("section")))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Alpha", "Charlie"]);
    }

    expectCards(["A", "B"]);
    rerender(<DiscordSeriesStats {...props} seriesSettings={settings("B")} />);
    expectCards(["B", "B"]);
    rerender(<DiscordSeriesStats {...props} seriesSettings={settings("C")} />);
    expectCards(["C", "B"]);
    expect(screen.getByRole("heading", { name: "C" })).toBe(first);
    expect(screen.getByRole("heading", { name: "B" })).toBe(second);
  });

  it("preserves both cards when duplicate team labels are edited", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const props = {
      data: aFakeSeriesDetailWithTeamSwap(),
      analyticsByMatchId: new Map(),
      viewMode: "wide" as const,
      streamerSettings: DEFAULT_ALL_SETTINGS,
      observerColors: DEFAULT_COLOR_SETTINGS.observerView,
      onObserverColorsChange: vi.fn(),
      onSeriesSettingsChange: vi.fn(),
      onViewPreviewChange: vi.fn(),
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
        streamerSettings={DEFAULT_ALL_SETTINGS}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
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
        streamerSettings={DEFAULT_ALL_SETTINGS}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
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

  it("allows previewing the archived overlay with its observer background", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const onViewPreviewChange = vi.fn<(enabled: boolean) => void>();
    const onViewModeSelect = vi.fn<(mode: "standard" | "wide" | "streamer") => void>();
    const settings = {
      ...DEFAULT_ALL_SETTINGS,
      global: { ...DEFAULT_ALL_SETTINGS.global, viewPreview: false },
    };

    render(
      <DiscordSeriesStats
        data={aFakeSeriesDetailResponseWith()}
        analyticsByMatchId={new Map()}
        viewMode="wide"
        streamerSettings={settings}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={onViewPreviewChange}
        onViewModeSelect={onViewModeSelect}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Preview overlay background/ }));
    expect(onViewPreviewChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Streamer Overlay" }));
    expect(onViewModeSelect).toHaveBeenCalledWith("streamer");

    cleanup();
    render(
      <DiscordSeriesStats
        data={aFakeSeriesDetailResponseWith()}
        analyticsByMatchId={new Map()}
        viewMode="streamer"
        streamerSettings={{ ...settings, global: { ...settings.global, viewPreview: true } }}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={onViewPreviewChange}
        onViewModeSelect={onViewModeSelect}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    expect(screen.getByTestId("archive-streamer-overlay").firstElementChild).toHaveClass(overlayStyles.previewObserver);
    fireEvent.click(screen.getByRole("button", { name: "Exit preview" }));
    expect(onViewModeSelect).toHaveBeenLastCalledWith("wide");
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
        streamerSettings={DEFAULT_ALL_SETTINGS}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
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
        streamerSettings={DEFAULT_ALL_SETTINGS}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={{ eagleColor: "jade", cobraColor: "sky" }}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
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
        streamerSettings={DEFAULT_ALL_SETTINGS}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={{ eagleColor: "invalid", cobraColor: "invalid" }}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
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
          streamerSettings={DEFAULT_ALL_SETTINGS}
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

  it("renders archived match details inside the transparent streamer overlay", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailResponseWith({
      context: { title: "Queue #7777 Series Stats", subtitle: "Guild 123456789012345678" },
    });

    render(
      <DiscordSeriesStats
        data={data}
        analyticsByMatchId={new Map()}
        viewMode="streamer"
        streamerSettings={{ ...DEFAULT_ALL_SETTINGS, global: { ...DEFAULT_ALL_SETTINGS.global, viewMode: "streamer" } }}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    expect(screen.getByTestId("archive-streamer-overlay")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Series overview" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Series/ }));
    expect(screen.getByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Live Fire/ }));
    expect(screen.queryByRole("heading", { name: "Series overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Match 1: Slayer: Live Fire" })).toBeInTheDocument();
  });

  it("keeps available match panels when archived series totals are unavailable", () => {
    const DiscordSeriesStats = createDiscordSeriesDetailStats();
    const data = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["match-one", "missing-match"],
        results: [
          Preconditions.checkExists(aFakeSeriesDetailResponseWith().matches.results[0], "Expected fake match detail"),
          { status: "unavailable", matchId: "missing-match", reason: "not-found" },
        ],
      },
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });

    render(
      <DiscordSeriesStats
        data={data}
        analyticsByMatchId={new Map()}
        viewMode="streamer"
        streamerSettings={{ ...DEFAULT_ALL_SETTINGS, global: { ...DEFAULT_ALL_SETTINGS.global, viewMode: "streamer" } }}
        seriesSettings={DEFAULT_SERIES_SETTINGS}
        observerColors={DEFAULT_COLOR_SETTINGS.observerView}
        onObserverColorsChange={vi.fn()}
        onSeriesSettingsChange={vi.fn()}
        onViewPreviewChange={vi.fn()}
        onViewModeSelect={vi.fn()}
        onAnalyticsTabSelected={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Series/ }));
    expect(
      screen.getByText("Series totals are unavailable because some match details could not be resolved."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Live Fire/ }));
    expect(screen.getByRole("heading", { name: "Match 1: Slayer: Live Fire" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Unknown map/ }));
    expect(screen.getByText("Failed to load detailed stats for match missing-match.")).toBeInTheDocument();
  });

  it("uses the latest substituted lineup and the presenter's bot label in the overlay", () => {
    const data = aFakeSeriesDetailWithTeamSwap();
    const customNames = ["Custom Eagles", "Custom Cobras"];
    const controller = new StatsDetailController();
    const model = new SeriesDetailStatsViewModelPresenter(controller).present(data);
    const aggregation = Preconditions.checkExists(
      data.aggregation.status === "resolved" ? data.aggregation : null,
      "Expected resolved series aggregation",
    );
    const overlayData: ReturnType<typeof aFakeSeriesDetailResponseWith> = {
      ...data,
      matches: { matchIds: ["missing"], results: [{ status: "unavailable", matchId: "missing", reason: "not-found" }] },
      aggregation: {
        ...aggregation,
        teams: aggregation.teams.map((team, index) => ({
          ...team,
          seriesTeamId: index + 2,
          name: index === 0 ? null : team.name,
        })),
      },
    };
    const latestLineupModel = {
      ...model,
      teams: model.teams.map((team, index) => ({
        ...team,
        seriesTeamId: index + 2,
        name: customNames[index] ?? team.name,
        players: index === 0 ? ["Bravo", "Substitute"] : ["Alpha", "Charlie", "Bot"],
      })),
    };
    const overlayPresenter = new ArchiveSeriesOverlayPresenter(controller);
    const overlayModel = overlayPresenter.present(overlayData, latestLineupModel, DEFAULT_ALL_SETTINGS, [], true);
    const modelWithoutTeamCards = { ...latestLineupModel, teams: [] };
    const fallbackModel = overlayPresenter.present(overlayData, modelWithoutTeamCards, DEFAULT_ALL_SETTINGS, [], true);

    expect(overlayModel.tickerMatchGroups[0]?.rows.slice(0, 2).map((row) => row.name)).toEqual(customNames);
    expect(fallbackModel.tickerMatchGroups[0]?.rows.slice(0, 2).map((row) => row.name)).toEqual(["Team 2", "Cobra"]);
    expect(overlayModel.teamLeft?.players.map((player) => player.displayName)).toEqual(["Bravo", "Substitute"]);
    expect(overlayModel.teamRight?.players.map((player) => player.displayName)).toEqual(["Alpha", "Charlie", "Bot"]);
  });
});
