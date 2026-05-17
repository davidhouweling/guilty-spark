import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IndividualModeMatches } from "../individual-mode-matches";
import type {
  LiveTrackerMatchRenderModel,
  LiveTrackerGroupRenderModel,
  LiveTrackerSeriesDataRenderModel,
  LiveTrackerPlayerRenderModel,
  LiveTrackerTeamRenderModel,
} from "../types";
import type { TeamColor } from "../../team-colors/team-colors";

const createMockMatch = (overrides: Partial<LiveTrackerMatchRenderModel> = {}): LiveTrackerMatchRenderModel => ({
  matchId: "match-1",
  gameTypeAndMap: "Slayer: Recharge",
  gameType: "Slayer",
  gameMap: "Recharge",
  gameMapThumbnailUrl: "data:,",
  duration: "5m",
  gameScore: "50:49",
  gameSubScore: null,
  startTime: "2025-01-01T00:00:00.000Z",
  endTime: "2025-01-01T00:05:00.000Z",
  rawMatchStats: null,
  playerXuidToGametag: {},
  ...overrides,
});

const createMockPlayer = (overrides: Partial<LiveTrackerPlayerRenderModel> = {}): LiveTrackerPlayerRenderModel => ({
  id: "player-1",
  displayName: "Player1",
  ...overrides,
});

const createMockTeam = (overrides: Partial<LiveTrackerTeamRenderModel> = {}): LiveTrackerTeamRenderModel => ({
  name: "Team 1",
  players: [createMockPlayer()],
  ...overrides,
});

const mockTeamColors: TeamColor[] = [
  { id: "eagle", name: "Eagle", hex: "#FF0000" },
  { id: "cobra", name: "Cobra", hex: "#0000FF" },
];

describe("Individual ModeMatches", () => {
  afterEach(() => {
    cleanup();
  });

  describe("Series Badge Display", () => {
    it("renders Active Series badge when series data matches grouping and status is active", () => {
      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [
          { name: "Team Alpha", playerIds: ["xuid1", "xuid2"] },
          { name: "Team Beta", playerIds: ["xuid3", "xuid4"] },
        ],
        seriesScore: "Team Alpha 2 - 1 Team Beta",
        matchIds: ["match-1", "match-2"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "neatqueue-series",
          groupId: "group-1",
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            createMockTeam({
              name: "Team Alpha",
              players: [createMockPlayer({ id: "xuid1" }), createMockPlayer({ id: "xuid2" })],
            }),
            createMockTeam({
              name: "Team Beta",
              players: [createMockPlayer({ id: "xuid3" }), createMockPlayer({ id: "xuid4" })],
            }),
          ],
          matches: [createMockMatch({ matchId: "match-1" }), createMockMatch({ matchId: "match-2" })],
          substitutions: [],
          seriesScore: "Team Alpha 2 - 1 Team Beta",
          seriesData,
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.getByText("Active Series")).toBeInTheDocument();
      expect(screen.getByText(/Test Guild - Queue #5/)).toBeInTheDocument();
    });

    it("renders Completed Series badge when series data matches grouping and status is not active", () => {
      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [{ name: "Team Alpha", playerIds: ["xuid1"] }],
        seriesScore: "Team Alpha 3 - 0 Team Beta",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "neatqueue-series",
          groupId: "group-1",
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [createMockTeam({ name: "Team Alpha", players: [createMockPlayer({ id: "xuid1" })] })],
          matches: [createMockMatch({ matchId: "match-1" })],
          substitutions: [],
          seriesScore: "Team Alpha 3 - 0 Team Beta",
          seriesData,
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="stopped"
        />,
      );

      expect(screen.getByText("Completed Series")).toBeInTheDocument();
    });

    it("does not render badge when seriesData is undefined", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "grouped-matches",
          groupId: "group-1",
          label: "Custom Games • Jan 1",
          seriesScore: "Series Matches",
          matches: [createMockMatch({ matchId: "match-unique-3" })],
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed Series")).not.toBeInTheDocument();
    });

    it("does not render badge when group is not a neatqueue series", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "single-match",
          groupId: "match-unique-4",
          match: createMockMatch({ matchId: "match-unique-4" }),
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed Series")).not.toBeInTheDocument();
    });
  });

  describe("Series Info Display", () => {
    it("displays series score and team information when NeatQueue series detected", () => {
      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [
          { name: "Team Eagle", playerIds: ["xuid1", "xuid2", "xuid3"] },
          { name: "Team Cobra", playerIds: ["xuid4", "xuid5"] },
        ],
        seriesScore: "Team Eagle 2 - 1 Team Cobra",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "neatqueue-series",
          groupId: "group-1",
          seriesId: { guildId: "guild-123", queueNumber: 5 },
          teams: [
            createMockTeam({
              name: "Team Eagle",
              players: [
                createMockPlayer({ id: "xuid1" }),
                createMockPlayer({ id: "xuid2" }),
                createMockPlayer({ id: "xuid3" }),
              ],
            }),
            createMockTeam({
              name: "Team Cobra",
              players: [createMockPlayer({ id: "xuid4" }), createMockPlayer({ id: "xuid5" })],
            }),
          ],
          matches: [createMockMatch({ matchId: "match-unique-5" })],
          substitutions: [],
          seriesScore: "Team Eagle 2 - 1 Team Cobra",
          seriesData,
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.getByText("Team Eagle 2 - 1 Team Cobra")).toBeInTheDocument();
      expect(screen.getByText("Team Eagle:")).toBeInTheDocument();
      expect(screen.getByText("3 players")).toBeInTheDocument();
      expect(screen.getByText("Team Cobra:")).toBeInTheDocument();
      expect(screen.getByText("2 players")).toBeInTheDocument();
    });

    it("does not display series info when group is not a neatqueue series", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "grouped-matches",
          groupId: "group-1",
          label: "Custom Games • Jan 1",
          seriesScore: "Series Matches",
          matches: [createMockMatch({ matchId: "match-unique-6" })],
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.queryByText("Team Alpha 1 - 0 Team Beta")).not.toBeInTheDocument();
    });
  });

  describe("Grouped Matches Display", () => {
    it("renders grouped matches with date range label when no seriesId", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "grouped-matches",
          groupId: "group-1",
          label: "Custom Games • Jan 1",
          seriesScore: "Series Matches",
          matches: [
            createMockMatch({
              matchId: "match-1",
              startTime: "2025-01-01T00:00:00.000Z",
              endTime: "2025-01-01T00:05:00.000Z",
            }),
            createMockMatch({
              matchId: "match-2",
              startTime: "2025-01-01T00:10:00.000Z",
              endTime: "2025-01-01T00:15:00.000Z",
            }),
          ],
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      // Check for the Custom Games label (part of the group label)
      expect(screen.getByText(/Custom Games/)).toBeInTheDocument();
    });

    it("renders match scores overview for grouped matches", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "grouped-matches",
          groupId: "group-1",
          label: "Custom Games • Jan 1",
          seriesScore: "2 - 0",
          matches: [
            createMockMatch({ matchId: "match-1", gameScore: "50:45" }),
            createMockMatch({ matchId: "match-2", gameScore: "50:48" }),
          ],
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.getByText("Game 1: 50:45")).toBeInTheDocument();
      expect(screen.getByText("Game 2: 50:48")).toBeInTheDocument();
    });
  });

  describe("Ungrouped Matches Display", () => {
    it("renders ungrouped matches as standalone", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "single-match",
          groupId: "standalone-unique-7",
          match: createMockMatch({ matchId: "standalone-unique-7" }),
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      // For single-match groups without match stats, should show unavailable alert
      expect(screen.getByText("Match stats unavailable")).toBeInTheDocument();
    });

    it("does not render series badge for ungrouped matches", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "single-match",
          groupId: "standalone-unique-8",
          match: createMockMatch({ matchId: "standalone-unique-8" }),
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Team Alpha 1 - 0 Team Beta")).not.toBeInTheDocument();
    });
  });

  describe("Match Stats Display", () => {
    it("renders alert when match stats are unavailable", () => {
      const groups: LiveTrackerGroupRenderModel[] = [
        {
          type: "grouped-matches",
          groupId: "group-1",
          label: "Custom Games • Jan 1",
          seriesScore: "Series Matches",
          matches: [createMockMatch({ matchId: "match-1" })],
        },
      ];

      render(
        <IndividualModeMatches
          groups={groups}
          groupStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.getAllByText("Match stats unavailable").length).toBeGreaterThan(0);
    });
  });
});
