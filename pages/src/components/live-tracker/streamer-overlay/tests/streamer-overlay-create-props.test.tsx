import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeamColor } from "../../../team-colors/team-colors";
import type { StreamerOverlayProps } from "../streamer-overlay";
import type { StreamerOverlayProps as SharedStreamerOverlayProps } from "../../../streamer-overlay/create";
import { LiveTrackerProvider, type LiveTrackerProviderProps } from "../../live-tracker-context";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import type { LiveTrackerViewModel } from "../../types";
import { DEFAULT_ALL_SETTINGS } from "../../settings/types";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";

vi.mock("../../../streamer-overlay/create", () => ({
  createStreamerOverlaySection: () =>
    function MockStreamerOverlaySection(props: SharedStreamerOverlayProps): React.ReactElement {
      const dimmedIconCount = props.tabs.reduce((count, tab) => {
        if (tab.type === "series") {
          return count + (tab.icons?.filter((icon) => icon.dimmed).length ?? 0);
        }

        if ("icons" in tab && tab.icons != null) {
          return count + tab.icons.filter((icon) => icon.dimmed).length;
        }

        return count;
      }, 0);

      return (
        <>
          <div data-testid="shared-overlay-matches-length">{props.matchesLength.toString()}</div>
          <div data-testid="shared-overlay-dimmed-icons">{dimmedIconCount.toString()}</div>
        </>
      );
    },
}));

const { StreamerOverlay } = await import("../streamer-overlay");

const defaultParams = { type: "team" as const, server: "test-server", queue: "5" };

function aFakeLiveTrackerViewModelWith(overrides?: Partial<LiveTrackerViewModel>): LiveTrackerViewModel {
  return {
    title: "Test Guild",
    subtitle: "Queue 5",
    iconUrl: "data:,",
    statusText: "active",
    statusClassName: "status-active",
    sortedSubstitutions: [],
    availablePlayers: [],
    params: defaultParams,
    allMatchStats: [],
    seriesStats: null,
    analyticsStatus: ComponentLoaderStatus.LOADED,
    allMatchKillMatrix: [],
    seriesKillMatrix: null,
    state: {
      type: "neatqueue",
      guildName: "Test Guild",
      guildId: "test-guild-id",
      guildIcon: "data:,",
      queueNumber: 5,
      status: "active",
      lastUpdateTime: "2025-01-01T00:00:00.000Z",
      teams: [
        {
          name: "Team 1",
          players: [{ id: "player1", displayName: "player_one" }],
        },
        {
          name: "Team 2",
          players: [{ id: "player2", displayName: "player_two" }],
        },
      ],
      matches: [],
      substitutions: [],
      seriesScore: "0:0",
      medalMetadata: { 1: { name: "Killing Spree", sortingWeight: 1500 } },
      playersAssociationData: {},
    },
    ...overrides,
  };
}

const defaultProviderProps: Omit<LiveTrackerProviderProps, "children"> = {
  params: defaultParams,
  model: aFakeLiveTrackerViewModelWith(),
  allMatchStats: [] as { matchId: string; data: never[] }[],
  seriesStats: null,
  analyticsStatus: ComponentLoaderStatus.LOADED,
  allMatchKillMatrix: [],
  seriesKillMatrix: null,
};

describe("StreamerOverlay create props", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];
  const gameModeIconUrl = (gameMode: string): string => `https://example.com/icons/${gameMode}.png`;

  const defaultProps: StreamerOverlayProps = {
    teamColors,
    gameModeIconUrl,
    settings: DEFAULT_ALL_SETTINGS,
    settingsUi: <div>Settings UI</div>,
  };

  it("passes seriesData match count to shared overlay when seriesData exists", () => {
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        guildId: "test-guild-id",
        guildIcon: "data:,",
        queueNumber: 5,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        teams: [
          { name: "Team 1", players: [{ id: "player1", displayName: "player_one" }] },
          { name: "Team 2", players: [{ id: "player2", displayName: "player_two" }] },
        ],
        matches: [
          {
            matchId: "match1",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            rawMatchStats: null,
            playerXuidToGametag: {},
          },
        ],
        substitutions: [],
        seriesScore: "0:0",
        medalMetadata: { 1: { name: "Killing Spree", sortingWeight: 1500 } },
        playersAssociationData: {},
        seriesData: {
          seriesId: { guildId: "test-guild-id", queueNumber: 5 },
          teams: [
            { name: "Team 1", playerIds: ["player1"] },
            { name: "Team 2", playerIds: ["player2"] },
          ],
          seriesScore: "0:0",
          matchIds: [],
          startTime: "2025-01-01T00:00:00.000Z",
          lastUpdateTime: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    render(
      <LiveTrackerProvider {...defaultProviderProps} model={model}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getByTestId("shared-overlay-matches-length")).toHaveTextContent("0");
  });

  it("passes dimmed tab icons for matches where Eagle loses", () => {
    const eagleLossStats = aFakeMatchStatsWith({
      Teams: [
        { ...aFakeMatchStatsWith().Teams[0], TeamId: 0, Outcome: 3 },
        { ...aFakeMatchStatsWith().Teams[1], TeamId: 1, Outcome: 2 },
      ],
    });
    const eagleWinStats = aFakeMatchStatsWith({
      Teams: [
        { ...aFakeMatchStatsWith().Teams[0], TeamId: 0, Outcome: 2 },
        { ...aFakeMatchStatsWith().Teams[1], TeamId: 1, Outcome: 3 },
      ],
    });

    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        guildId: "test-guild-id",
        guildIcon: "data:,",
        queueNumber: 5,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        teams: [
          { name: "Team 1", players: [{ id: "player1", displayName: "player_one" }] },
          { name: "Team 2", players: [{ id: "player2", displayName: "player_two" }] },
        ],
        matches: [
          {
            matchId: "match-loss",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "45:50",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            rawMatchStats: eagleLossStats,
            playerXuidToGametag: {},
          },
          {
            matchId: "match-win",
            gameTypeAndMap: "CTF: Argyle",
            gameType: "CTF",
            gameMap: "Argyle",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "5:3",
            gameSubScore: null,
            startTime: "2024-12-31T23:35:00.000Z",
            endTime: "2024-12-31T23:45:00.000Z",
            rawMatchStats: eagleWinStats,
            playerXuidToGametag: {},
          },
        ],
        substitutions: [],
        seriesScore: "1:1",
        medalMetadata: { 1: { name: "Killing Spree", sortingWeight: 1500 } },
        playersAssociationData: {},
      },
    });
    const settingsWithTabs = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_ALL_SETTINGS.global,
        ticker: {
          ...DEFAULT_ALL_SETTINGS.global.ticker,
          showTabs: true,
        },
      },
    };

    render(
      <LiveTrackerProvider {...defaultProviderProps} model={model}>
        <StreamerOverlay {...defaultProps} settings={settingsWithTabs} />
      </LiveTrackerProvider>,
    );

    const dimmedIconNodes = screen.getAllByTestId("shared-overlay-dimmed-icons");
    expect(dimmedIconNodes.at(-1)).toHaveTextContent("1");
  });

  it("uses TeamId rather than team array order for tab dimming", () => {
    const reorderedTeamsStats = aFakeMatchStatsWith({
      Teams: [
        { ...aFakeMatchStatsWith().Teams[1], TeamId: 1, Outcome: 3 },
        { ...aFakeMatchStatsWith().Teams[0], TeamId: 0, Outcome: 2 },
      ],
    });
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        guildId: "test-guild-id",
        guildIcon: "data:,",
        queueNumber: 5,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        teams: [
          { name: "Team 1", players: [{ id: "player1", displayName: "player_one" }] },
          { name: "Team 2", players: [{ id: "player2", displayName: "player_two" }] },
        ],
        matches: [
          {
            matchId: "match-reordered-win",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "50:45",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            rawMatchStats: reorderedTeamsStats,
            playerXuidToGametag: {},
          },
        ],
        substitutions: [],
        seriesScore: "1:0",
        medalMetadata: { 1: { name: "Killing Spree", sortingWeight: 1500 } },
        playersAssociationData: {},
      },
    });
    const settingsWithTabs = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_ALL_SETTINGS.global,
        ticker: {
          ...DEFAULT_ALL_SETTINGS.global.ticker,
          showTabs: true,
        },
      },
    };

    render(
      <LiveTrackerProvider {...defaultProviderProps} model={model}>
        <StreamerOverlay {...defaultProps} settings={settingsWithTabs} />
      </LiveTrackerProvider>,
    );

    const dimmedIconNodes = screen.getAllByTestId("shared-overlay-dimmed-icons");
    expect(dimmedIconNodes.at(-1)).toHaveTextContent("0");
  });
});
