import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`}>Team {teamId.toString()}</div>
  ),
}));

vi.mock("../../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <div data-testid="rank-icon">Rank</div>,
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
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m-1",
          mapName: "Aquarius",
          score: "50:30",
          killsDeathsAssistsKda: "20:10:7 (2.23)",
          damageDealtTakenRatio: "6,100:4,900 (1.24)",
        }),
      ],
    });

    renderViewer(view);

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
    expect(screen.getByText("50:30")).toBeInTheDocument();
    expect(screen.getByText("20:10:7 (2.23)")).toBeInTheDocument();
    expect(screen.getByText("6,100:4,900 (1.24)")).toBeInTheDocument();
    expect(screen.getByAltText("Slayer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /match/i })).toBeInTheDocument();
  });

  it("renders matchmaking playlist subtitle when available", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m-1",
          mapName: "Recharge",
          isMatchmaking: true,
          matchmakingPlaylist: "Ranked Arena",
        }),
      ],
    });

    renderViewer(view);

    expect(screen.getByText("Ranked Arena")).toBeInTheDocument();
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
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m-1",
          killsDeathsAssistsKda: "11:8:4 (1.54)",
          damageDealtTakenRatio: "4,400:3,900 (1.13)",
        }),
        aFakeTrackerMatchSummaryWith({
          matchId: "m-2",
          killsDeathsAssistsKda: "9:7:5 (1.52)",
          damageDealtTakenRatio: "3,800:3,600 (1.06)",
        }),
      ],
      series: [
        aFakeTrackerSeriesGroupWith({
          matchIds: ["m-1", "m-2"],
          title: "Ranked Series",
          score: "1:1",
          killsDeathsAssistsKda: "20:15:9 (1.53)",
          damageDealtTakenRatio: "8,200:7,500 (1.09)",
        }),
      ],
    });

    renderViewer(view);

    expect(screen.getByText("Ranked Series")).toBeInTheDocument();
    expect(screen.getByText("1:1")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Series Ranked Series")).getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("20:15:9 (1.53)")).toBeInTheDocument();
    expect(screen.getByText("8,200:7,500 (1.09)")).toBeInTheDocument();
    expect(screen.getByText(/End time/)).toBeInTheDocument();
  });

  it("renders In progress for an active series", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m-1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-2", outcome: "Loss" }),
      ],
      series: [
        aFakeTrackerSeriesGroupWith({ matchIds: ["m-1", "m-2"], title: "Ranked Series", subtitle: "Best of 3" }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Ranked Series",
        subtitle: "Best of 3",
        teams: [],
      },
    });

    renderViewer(view);

    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText(/Start time/)).toBeInTheDocument();
    expect(screen.queryByText(/End time/)).not.toBeInTheDocument();
  });

  it("marks only the most recent series as In progress when active context is missing", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m-1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-2", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-3", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m-4", outcome: "Loss" }),
      ],
      series: [
        aFakeTrackerSeriesGroupWith({ id: "series-older", title: "Older Series", matchIds: ["m-1", "m-2"] }),
        aFakeTrackerSeriesGroupWith({ id: "series-recent", title: "Recent Series", matchIds: ["m-3", "m-4"] }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: undefined,
    });

    renderViewer(view);

    expect(screen.getAllByText("In progress")).toHaveLength(1);
    expect(screen.getByLabelText("Series Recent Series")).toHaveTextContent("In progress");
    expect(screen.getByLabelText("Series Older Series")).not.toHaveTextContent("In progress");
  });

  it("renders a Live badge when the tracker is live", () => {
    const view = aFakeTrackerViewStateWith({ isLive: true });

    renderViewer(view);

    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders stats highlights under the Tracked Gameplay heading", () => {
    const view = aFakeTrackerViewStateWith({
      statsHighlights: [
        {
          label: "Current Rank",
          value: "1,567",
          rankIcon: {
            rankTier: "Onyx",
            subTier: 0,
            measurementMatchesRemaining: 0,
            initialMeasurementMatches: 10,
          },
        },
        { label: "KDA", value: "3.4" },
      ],
    });

    renderViewer(view, "connected", false);

    const trackedGameplayHeading = screen.getByRole("heading", { name: "Tracked Gameplay" });
    const statsList = screen.getByLabelText("Stats highlights");

    expect(statsList).toBeInTheDocument();
    expect(trackedGameplayHeading.compareDocumentPosition(statsList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Accumulated Stats" })).not.toBeInTheDocument();
  });

  it("uses the 8-item grid modifier when eight stats highlights are present", () => {
    const view = aFakeTrackerViewStateWith({
      statsHighlights: [
        { label: "1", value: "1" },
        { label: "2", value: "2" },
        { label: "3", value: "3" },
        { label: "4", value: "4" },
        { label: "5", value: "5" },
        { label: "6", value: "6" },
        { label: "7", value: "7" },
        { label: "8", value: "8" },
      ],
    });

    renderViewer(view, "connected", false);

    expect(screen.getByLabelText("Stats highlights").className).toMatch(/gridEightItems/);
  });

  it("renders an empty state when there are no matches", () => {
    const view = aFakeTrackerViewStateWith({ matches: [], series: [] });

    renderViewer(view);

    expect(screen.getByText("No matches tracked yet.")).toBeInTheDocument();
  });

  it("renders an active pre-series panel instead of empty state when an active series has no matches", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [],
      series: [],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Ranked Series",
        subtitle: "Best of 5",
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: null, discordName: "AlphaOne", gamertag: "AlphaTag", xboxId: null }],
          },
          {
            id: 1,
            name: "Beta",
            players: [{ discordId: null, discordName: null, gamertag: "BetaTag", xboxId: null }],
          },
        ],
      },
    });

    const model = aModel(view);
    const [pendingSeries] = model.timeline;
    const pendingSeriesId = pendingSeries.type === "series" ? pendingSeries.series.id : null;
    const expandedEntryKeys = pendingSeriesId == null ? new Set<string>() : new Set([`series:${pendingSeriesId}`]);

    render(
      <IndividualTrackerViewer
        renderModel={model}
        connectionStatus="connected"
        expandedEntryKeys={expandedEntryKeys}
        entryStates={new Map()}
        canManage={true}
        refreshPending={false}
        onToggleEntry={() => undefined}
        onBackToManage={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.queryByText("No matches tracked yet.")).not.toBeInTheDocument();
    expect(screen.getByText("Series is active and waiting for the first tracked match.")).toBeInTheDocument();
    expect(screen.getByText("Player Info")).toBeInTheDocument();
    expect(screen.getByLabelText("Player information")).toBeInTheDocument();
    expect(screen.getByText("AlphaOne")).toBeInTheDocument();
    expect(screen.getAllByText("BetaTag").length).toBeGreaterThan(0);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("renders additional tracked matches message when active pre-series has no grouped series matches", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Aquarius" })],
      series: [],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Ranked Series",
        subtitle: "Best of 5",
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: "discord-alpha", discordName: "AlphaOne", gamertag: "AlphaTag", xboxId: null }],
          },
        ],
      },
    });

    const model = aModel(view);
    const pendingSeries = model.timeline.find(
      (item): item is Extract<(typeof model.timeline)[number], { type: "series" }> => item.type === "series",
    );
    const pendingSeriesId = pendingSeries?.series.id ?? null;
    const expandedEntryKeys = pendingSeriesId == null ? new Set<string>() : new Set([`series:${pendingSeriesId}`]);

    render(
      <IndividualTrackerViewer
        renderModel={model}
        connectionStatus="connected"
        expandedEntryKeys={expandedEntryKeys}
        entryStates={new Map()}
        canManage={true}
        refreshPending={false}
        onToggleEntry={() => undefined}
        onBackToManage={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByText("Series is active and waiting for additional tracked matches.")).toBeInTheDocument();
  });

  it("renders reconnecting status in the badge for disconnected state", () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "Spartan One" });

    renderViewer(view, "disconnected");

    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });

  it("disables refresh when connection is disconnected", () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "Spartan One", status: "active" });

    renderViewer(view, "disconnected");

    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(screen.getByText(/Next update:\s*reconnecting/i)).toBeInTheDocument();
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
