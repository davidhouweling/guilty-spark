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
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
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
        streamerSettings={undefined}
        matchStatsState={null}
        matchStatsPanelState={null}
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
        streamerSettings={undefined}
        matchStatsState={null}
        matchStatsPanelState={null}
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
        streamerSettings={undefined}
        matchStatsState={{ status: "loading" }}
        matchStatsPanelState={{ status: "loading" }}
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
        streamerSettings={undefined}
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
          analytics: null,
        }}
        matchStatsPanelState={null}
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
        streamerSettings={undefined}
        matchStatsState={{ status: "error", message: "Network failure" }}
        matchStatsPanelState={{ status: "error", message: "Network failure" }}
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
        streamerSettings={undefined}
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
          analytics: null,
        }}
        matchStatsPanelState={null}
        selectedMatchId="m-1"
        onSelectMatch={() => undefined}
        onDeselect={onDeselect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it("renders active series team details using display-name fallbacks", () => {
    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
          series: [
            aFakeTrackerSeriesGroupWith({
              id: "series-1",
              title: "Alpha vs Beta",
              subtitle: "Bo3",
              matchIds: ["m-1", "m-2"],
              score: "1:0",
            }),
          ],
          hasActiveSeries: true,
          activeSeriesContext: {
            title: "Alpha vs Beta",
            subtitle: "Bo3",
            teams: [
              {
                id: 0,
                name: "Alpha",
                players: [
                  { discordId: null, discordName: "Discord Name", gamertag: "Gamertag Name", xboxId: null },
                  { discordId: null, discordName: null, gamertag: "Xbox Only", xboxId: null },
                ],
              },
              {
                id: 1,
                name: "Beta",
                players: [{ discordId: null, discordName: null, gamertag: null, xboxId: null }],
              },
            ],
          },
        })}
        streamerSettings={undefined}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Discord Name")).toBeInTheDocument();
    expect(screen.getByText("Xbox Only")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("maps team details by team id regardless of active-series team order", () => {
    render(
      <IndividualTrackerOverlay
        renderModel={aRenderModel({
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
          series: [
            aFakeTrackerSeriesGroupWith({
              id: "series-1",
              title: "Alpha vs Beta",
              subtitle: "Bo3",
              matchIds: ["m-1", "m-2"],
              score: "1:0",
            }),
          ],
          hasActiveSeries: true,
          activeSeriesContext: {
            title: "Alpha vs Beta",
            subtitle: "Bo3",
            teams: [
              {
                id: 1,
                name: "Beta",
                players: [{ discordId: null, discordName: null, gamertag: "Beta Player", xboxId: null }],
              },
              {
                id: 2,
                name: "Gamma",
                players: [{ discordId: null, discordName: null, gamertag: "Ignored Player", xboxId: null }],
              },
              {
                id: 0,
                name: "Alpha",
                players: [{ discordId: null, discordName: null, gamertag: "Alpha Player", xboxId: null }],
              },
            ],
          },
        })}
        streamerSettings={undefined}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    const leftTeamContainer = screen.getByTestId("team-icon-0").parentElement;
    const rightTeamContainer = screen.getByTestId("team-icon-1").parentElement;

    expect(leftTeamContainer?.textContent).toContain("Alpha");
    expect(leftTeamContainer?.textContent).toContain("Alpha Player");
    expect(rightTeamContainer?.textContent).toContain("Beta");
    expect(rightTeamContainer?.textContent).toContain("Beta Player");
    expect(screen.queryByText("Ignored Player")).not.toBeInTheDocument();
  });

  it("shows a 0:0 series tab and no waiting banner when in-series has no matches yet and ticker is disabled", () => {
    const renderModel = aRenderModel({
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: "Bo3",
        teams: [],
      },
      matches: [],
      series: [],
    });
    const streamerSettings: StreamerViewSettings = {
      visibleSections: {
        showTicker: false,
      },
    };

    render(
      <IndividualTrackerOverlay
        renderModel={renderModel}
        streamerSettings={streamerSettings}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /series score/i })).toBeInTheDocument();
    expect(screen.queryByText("Waiting for first match to complete...")).not.toBeInTheDocument();
  });

  it("shows player pre-series ticker with no team icon when in-series has no matches and ticker is enabled", () => {
    const renderModel = aRenderModel({
      gamertag: "TrackedPlayer",
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: "Bo3",
        teams: [],
      },
      matches: [],
      series: [],
    });
    const streamerSettings: StreamerViewSettings = {
      visibleSections: {
        showTicker: true,
      },
    };

    render(
      <IndividualTrackerOverlay
        renderModel={renderModel}
        streamerSettings={streamerSettings}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("Player Info")).toBeInTheDocument();
    expect(screen.getByText("TrackedPlayer")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for first match to complete...")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-icon-0")).not.toBeInTheDocument();
  });

  it("respects visibility settings for tabs and top section content", () => {
    const renderModel = aRenderModel({
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Custom Series Title",
        subtitle: "Custom Series Subtitle",
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: null, discordName: "AlphaDiscord", gamertag: "AlphaTag", xboxId: null }],
          },
          {
            id: 1,
            name: "Beta",
            players: [{ discordId: null, discordName: "BetaDiscord", gamertag: "BetaTag", xboxId: null }],
          },
        ],
      },
      matches: [],
      series: [],
    });

    const streamerSettings: StreamerViewSettings = {
      visibleSections: {
        showTabs: false,
        showTitle: false,
        showSubtitle: false,
        showTeamDetails: false,
      },
    };

    render(
      <IndividualTrackerOverlay
        renderModel={renderModel}
        streamerSettings={streamerSettings}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: /series score/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Custom Series Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom Series Subtitle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-icon-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-icon-1")).not.toBeInTheDocument();
  });

  it("uses xbox names in team details when discord names are hidden", () => {
    const renderModel = aRenderModel({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      series: [
        aFakeTrackerSeriesGroupWith({
          id: "series-1",
          title: "Alpha vs Beta",
          subtitle: "Bo3",
          matchIds: ["m-1", "m-2"],
          score: "1:0",
        }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: "Bo3",
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: null, discordName: "DiscordAlpha", gamertag: "XboxAlpha", xboxId: null }],
          },
          {
            id: 1,
            name: "Beta",
            players: [{ discordId: null, discordName: "DiscordBeta", gamertag: "XboxBeta", xboxId: null }],
          },
        ],
      },
    });

    const streamerSettings: StreamerViewSettings = {
      visibleSections: {
        showDiscordNames: false,
        showXboxNames: true,
      },
    };

    render(
      <IndividualTrackerOverlay
        renderModel={renderModel}
        streamerSettings={streamerSettings}
        matchStatsState={null}
        matchStatsPanelState={null}
        selectedMatchId={null}
        onSelectMatch={() => undefined}
        onDeselect={() => undefined}
      />,
    );

    expect(screen.getByText("XboxAlpha")).toBeInTheDocument();
    expect(screen.getByText("XboxBeta")).toBeInTheDocument();
    expect(screen.queryByText("DiscordAlpha")).not.toBeInTheDocument();
    expect(screen.queryByText("DiscordBeta")).not.toBeInTheDocument();
  });
});
