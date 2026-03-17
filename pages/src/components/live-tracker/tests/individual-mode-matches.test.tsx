import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IndividualModeMatches } from "../individual-mode-matches";
import type { LiveTrackerMatchRenderModel, LiveTrackerMatchGrouping, LiveTrackerSeriesDataRenderModel } from "../types";
import type { MatchStatsData } from "../../stats/types";
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
      const matches = [createMockMatch({ matchId: "match-1" }), createMockMatch({ matchId: "match-2" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-1", "match-2"],
          seriesId: { guildId: "guild-123", queueNumber: 5 },
        },
      };

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

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="active"
        />,
      );

      expect(screen.getByText("Active Series")).toBeInTheDocument();
      expect(screen.getByText(/Test Guild - Queue #5/)).toBeInTheDocument();
    });

    it("renders Completed Series badge when series data matches grouping and status is not active", () => {
      const matches = [createMockMatch({ matchId: "match-1" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-1"],
          seriesId: { guildId: "guild-123", queueNumber: 5 },
        },
      };

      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [{ name: "Team Alpha", playerIds: ["xuid1"] }],
        seriesScore: "Team Alpha 3 - 0 Team Beta",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="stopped"
        />,
      );

      expect(screen.getByText("Completed Series")).toBeInTheDocument();
    });

    it("does not render badge when seriesData is undefined", () => {
      const matches = [createMockMatch({ matchId: "match-unique-3" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-unique-3"],
          seriesId: undefined,
        },
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={undefined}
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed Series")).not.toBeInTheDocument();
    });

    it("does not render badge when seriesId does not match grouping", () => {
      const matches = [createMockMatch({ matchId: "match-unique-4" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-unique-4"],
          seriesId: { guildId: "guild-456", queueNumber: 10 },
        },
      };

      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [{ name: "Team Alpha", playerIds: ["xuid1"] }],
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed Series")).not.toBeInTheDocument();
    });
  });

  describe("Series Info Display", () => {
    it("displays series score and team information when NeatQueue series detected", () => {
      const matches = [createMockMatch({ matchId: "match-unique-5" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-unique-5"],
          seriesId: { guildId: "guild-123", queueNumber: 5 },
        },
      };

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

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="active"
        />,
      );

      expect(screen.getByText("Team Eagle 2 - 1 Team Cobra")).toBeInTheDocument();
      expect(screen.getByText("Team Eagle:")).toBeInTheDocument();
      expect(screen.getByText("3 players")).toBeInTheDocument();
      expect(screen.getByText("Team Cobra:")).toBeInTheDocument();
      expect(screen.getByText("2 players")).toBeInTheDocument();
    });

    it("does not display series info when seriesData does not match grouping", () => {
      const matches = [createMockMatch({ matchId: "match-unique-6" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-unique-6"],
          seriesId: { guildId: "guild-999", queueNumber: 99 },
        },
      };

      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [{ name: "Team Alpha", playerIds: ["xuid1"] }],
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="active"
        />,
      );

      expect(screen.queryByText("Team Alpha 1 - 0 Team Beta")).not.toBeInTheDocument();
    });
  });

  describe("Grouped Matches Display", () => {
    it("renders grouped matches with date range label when no seriesId", () => {
      const matches = [
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
      ];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-1", "match-2"],
        },
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      expect(screen.getByText(/Series Matches/)).toBeInTheDocument();
    });

    it("renders match scores overview for grouped matches", () => {
      const matches = [
        createMockMatch({ matchId: "match-1", gameScore: "50:45" }),
        createMockMatch({ matchId: "match-2", gameScore: "50:48" }),
      ];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-1", "match-2"],
        },
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
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
      const matches = [createMockMatch({ matchId: "standalone-unique-7" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {};

      const allMatchStats = [{ matchId: "standalone-unique-7", data: [] as MatchStatsData[] }];

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={allMatchStats}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          status="active"
        />,
      );

      // The match title appears both in the Collapsible header and in the MatchStatsView component
      expect(screen.queryAllByText("Match 1: Slayer: Recharge").length).toBeGreaterThan(0);
    });

    it("does not render series badge for ungrouped matches", () => {
      const matches = [createMockMatch({ matchId: "standalone-unique-8" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {};

      const seriesData: LiveTrackerSeriesDataRenderModel = {
        seriesId: { guildId: "guild-123", queueNumber: 5 },
        teams: [{ name: "Team Alpha", playerIds: ["xuid1"] }],
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        matchIds: ["match-1"],
        startTime: "2025-01-01T00:00:00.000Z",
        lastUpdateTime: "2025-01-01T00:10:00.000Z",
      };

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={[]}
          groupingStats={new Map()}
          gameModeIconUrl={() => "data:,"}
          teamColors={mockTeamColors}
          viewMode="desktop"
          guildName="Test Guild"
          seriesData={seriesData}
          status="active"
        />,
      );

      expect(screen.queryByText("Active Series")).not.toBeInTheDocument();
      expect(screen.queryByText("Team Alpha 1 - 0 Team Beta")).not.toBeInTheDocument();
    });
  });

  describe("Match Stats Display", () => {
    it("renders alert when match stats are unavailable", () => {
      const matches = [createMockMatch({ matchId: "match-1" })];

      const matchGroupings: Record<string, LiveTrackerMatchGrouping> = {
        "group-1": {
          groupId: "group-1",
          matchIds: ["match-1"],
        },
      };

      const allMatchStats = [{ matchId: "match-1", data: null }];

      render(
        <IndividualModeMatches
          matches={matches}
          matchGroupings={matchGroupings}
          allMatchStats={allMatchStats}
          groupingStats={new Map()}
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
