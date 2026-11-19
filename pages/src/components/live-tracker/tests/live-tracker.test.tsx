import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";

import type {
  LiveTrackerMatchSummary,
  LiveTrackerMessage,
  LiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/types";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakePlayerAssociationDataWith } from "@guilty-spark/shared/live-tracker/fakes/data";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakePlayerWith,
  aFakePlayerTeamStatsWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import type {
  LiveTrackerConnection,
  LiveTrackerStatusListener,
  SteppableLiveTrackerConnection,
} from "../../../services/live-tracker/types";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import { aFakeLiveTrackerServiceWith } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/series-matches/fakes/series-matches.fake";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import {
  aFakeLivePreSeriesResponseWith,
  aFakeLivePreSeriesServiceWith,
} from "../../../services/live-pre-series/fakes/live-pre-series.fake";
import type { LivePreSeriesService } from "../../../services/live-pre-series/types";
import { createLiveTracker } from "../create";
import containerStyles from "../../container/container.module.css";
import seriesStatsStyles from "../../series-stats/series-stats.module.css";

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <div data-testid="team-icon">Team</div>,
}));

vi.mock("../../scrolling-content/scrolling-content", () => ({
  ScrollingContent: ({
    children,
    onScrollComplete,
  }: {
    children: React.ReactNode;
    onScrollComplete?: (() => void) | undefined;
  }): React.ReactNode => (
    <div>
      {children}
      <button onClick={onScrollComplete}>Finish ticker row</button>
    </div>
  ),
}));

function isSteppableLiveTrackerConnection(
  connection: LiveTrackerConnection,
): connection is SteppableLiveTrackerConnection {
  return "step" in connection && typeof connection.step === "function";
}

function aMatchSummary(matchId: string): LiveTrackerMatchSummary {
  return {
    matchId,
    gameTypeAndMap: "Slayer: Aquarius",
    gameType: "Slayer",
    gameMap: "Aquarius",
    gameMapThumbnailUrl: "data:,",
    duration: "10m 0s",
    gameScore: "50:49",
    gameSubScore: null,
    startTime: "2024-12-31T23:50:00.000Z",
    endTime: "2025-01-01T00:00:00.000Z",
    playerXuidToGametag: {},
  };
}

function aStateMessage(matchIds: readonly string[], rawMatchIds: readonly string[] = []): LiveTrackerStateMessage {
  return {
    type: "state",
    timestamp: "2025-01-01T00:00:00.000Z",
    data: {
      type: "neatqueue",
      guildId: "1",
      guildIcon: null,
      guildName: "Guild 1",
      channelId: "2",
      queueNumber: 3,
      status: "active",
      lastUpdateTime: "2025-01-01T00:00:00.000Z",
      players: [
        { id: "team-1-player", discordUsername: "Team 1 player" },
        { id: "team-2-player", discordUsername: "Team 2 player" },
      ],
      teams: [
        { name: "Team 1", playerIds: ["team-1-player"] },
        { name: "Team 2", playerIds: ["team-2-player"] },
      ],
      substitutions: [],
      matchSummaries: matchIds.map(aMatchSummary),
      rawMatches: Object.fromEntries(
        rawMatchIds.map((id) => [id, { MatchId: id, Teams: [], Players: [], MatchInfo: {} }]),
      ),
      seriesScore: "0:0",
      playersAssociationData: {},
    },
  };
}

async function renderLiveTrackerWith(
  stateMessage: LiveTrackerStateMessage,
  analyticsService = aFakeMatchAnalyticsServiceWith(),
  search = "?server=1&queue=3",
  options: {
    readonly additionalMessages?: readonly LiveTrackerMessage[];
    readonly seriesMatchesService?: SeriesMatchesService;
    readonly livePreSeriesService?: LivePreSeriesService;
  } = {},
): Promise<SteppableLiveTrackerConnection> {
  window.history.pushState({}, "", `/tracker${search}`);

  const scenario = aFakeLiveTrackerScenarioWith({
    intervalMs: 10,
    frames: [stateMessage, ...(options.additionalMessages ?? [])],
  });
  const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });
  const connection = await liveTrackerService.connect({ type: "team" as const, guildId: "1", queueNumber: "3" });
  vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
  const LiveTracker = createLiveTracker({
    liveTrackerService,
    matchAnalyticsService: analyticsService,
    seriesMatchesService: options.seriesMatchesService ?? aFakeSeriesMatchesServiceWith(),
    livePreSeriesService: options.livePreSeriesService ?? aFakeLivePreSeriesServiceWith(),
  });

  render(<LiveTracker />);
  await waitFor(() => expect(screen.getByText("Connecting...")).toBeInTheDocument());

  if (!isSteppableLiveTrackerConnection(connection)) {
    throw new Error("Expected steppable fake connection in manual mode");
  }
  return connection;
}

describe("LiveTracker", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it.each(["normal", "streamer"])(
    "uses configured scores and swapped colors on reversed first sides (%s)",
    async (viewMode) => {
      const detail = aFakeMatchDetailWith({
        matchId: "m1",
        teamCount: 2,
        teams: [
          aFakeTeamWith({ matchTeamId: 1, seriesTeamId: 0 }),
          aFakeTeamWith({ matchTeamId: 0, seriesTeamId: 1, outcome: "Loss", playerIds: [] }),
        ],
        players: [
          aFakePlayerWith({
            lastMatchTeamId: 1,
            teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 1, seriesTeamId: 0 })],
          }),
        ],
        score: {
          primary: {
            metric: "score",
            teams: [
              { matchTeamId: 0, seriesTeamId: 1, value: 40 },
              { matchTeamId: 1, seriesTeamId: 0, value: 50 },
            ],
          },
          secondary: null,
        },
      });
      const response = aFakeSeriesDetailResponseWith({
        matches: { matchIds: ["m1"], results: [{ status: "resolved", matchId: "m1", detail }] },
        aggregation: {
          status: "resolved",
          gamesPlayed: 1,
          completedGameCount: 1,
          players: [],
          teams: [
            aFakeSeriesTeamWith({ gamesWon: 1 }),
            aFakeSeriesTeamWith({ seriesTeamId: 1, gamesWon: 0, outcome: "Loss", playerIds: [] }),
          ],
        },
      });
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      let releaseDetail: ((value: typeof response) => void) | undefined;
      vi.spyOn(seriesMatchesService, "getSeriesDetail").mockImplementation(
        async () =>
          new Promise((resolve) => {
            releaseDetail = resolve;
          }),
      );
      const message = aStateMessage(["m1"]);
      const connection = await renderLiveTrackerWith(
        {
          ...message,
          data: {
            ...message.data,
            seriesScore: "0:1",
            matchSummaries: message.data.matchSummaries.map((match) => ({ ...match, gameScore: "40:50" })),
          },
        },
        aFakeMatchAnalyticsServiceWith(),
        `?server=1&queue=3&viewMode=${viewMode}&showTabs=true&showTicker=true&eagleColor=cerulean&cobraColor=salmon`,
        { seriesMatchesService },
      );
      connection.step();
      if (viewMode === "normal") {
        expect(await screen.findByRole("heading", { name: "Series scores" })).toHaveTextContent("0:1");
      } else {
        expect(await screen.findByRole("button", { name: /Series score/ })).toHaveTextContent("0:1");
      }
      Preconditions.checkExists(releaseDetail)(response);
      if (viewMode === "normal") {
        await waitFor(() => expect(screen.getByRole("heading", { name: "Series scores" })).toHaveTextContent("1:0"));
        const tile = within(screen.getByRole("list", { name: "Series score tiles" })).getByRole("listitem");
        expect(tile).toHaveTextContent("50:40");
        expect(tile).toHaveStyle({ "--team-color": "#3B9DFF" });
      } else {
        await waitFor(() => expect(screen.getByRole("button", { name: /Series score/ })).toHaveTextContent("1:0"));
        const matchTab = screen.getByRole("button", { name: /Aquarius/ });
        expect(matchTab).toHaveTextContent("50:40");
        expect(matchTab).toHaveStyle({ "--tab-team-color": "#3B9DFF" });
        fireEvent.click(matchTab);
        const panel = Preconditions.checkExists(document.getElementById("m1"));
        const playerRow = within(panel)
          .getAllByText("Spartan One")
          .map((player) => player.closest("tr"))
          .find((row) => row != null);
        expect(playerRow).toHaveStyle({ "--row-color": "#3B9DFF" });
        const seriesTicker = screen.getByText("Team 1 (Accumulated)").closest('[style*="--row-color"]');
        if (!(seriesTicker instanceof HTMLElement)) {
          throw new Error("Expected the rendered ticker container");
        }
        fireEvent.click(within(seriesTicker).getByRole("button", { name: "Finish ticker row" }));
        fireEvent.click(within(seriesTicker).getByRole("button", { name: "Finish ticker row" }));
        await waitFor(() => {
          const ticker = screen.getByText("Team 1 (Accumulated)").closest('[style*="--row-color"]');
          expect(ticker).toHaveTextContent("Slayer: Aquarius");
          expect(ticker).toHaveStyle({ "--row-color": "#3B9DFF" });
        });
      }
    },
  );

  it("appends upcoming map tiles to the completed score list", async () => {
    const message = aStateMessage(["m1"]);
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    vi.spyOn(seriesMatchesService, "getSeriesDetail").mockResolvedValue(
      aFakeSeriesDetailResponseWith({
        matches: { matchIds: ["m1"], results: [{ status: "unavailable", matchId: "m1", reason: "not-found" }] },
        aggregation: { status: "unavailable", reason: "incomplete-matches" },
      }),
    );
    const match = message.data.matchSummaries.at(0);
    if (match == null) {
      throw new Error("Expected match summary");
    }
    const connection = await renderLiveTrackerWith(
      {
        ...message,
        data: {
          ...message.data,
          plannedMaps: [
            { mode: "Oddball", map: "Streets" },
            { mode: "Strongholds", map: "Recharge" },
          ],
          rawMatches: {
            m1: {
              MatchId: "m1",
              Teams: [],
              Players: [],
              MatchInfo: {
                StartTime: match.startTime,
                EndTime: match.endTime,
                MapVariant: { AssetId: "aquarius", VersionId: "v1" },
                GameVariantCategory: 1,
              },
            },
          },
        },
      },
      aFakeMatchAnalyticsServiceWith(),
      "?server=1&queue=3",
      { seriesMatchesService },
    );
    connection.step();

    const scores = await screen.findByRole("list", { name: "Series score tiles" });
    const [played, upcoming] = within(scores).getAllByRole("listitem");
    expect(played).toHaveTextContent("50:49");
    expect(played).toHaveTextContent("Aquarius");
    expect(played.querySelector("img")).toHaveAttribute("alt", "Slayer");
    expect(upcoming).toHaveTextContent("Strongholds: Recharge");
    expect(upcoming).not.toHaveTextContent("50:49");
    expect(upcoming.querySelector("img")).toHaveAttribute("alt", "");
    expect(upcoming).toHaveClass(/seriesScoreUpcoming/);
    expect(screen.queryByText("Map plan")).not.toBeInTheDocument();
  });

  it("retries captured data, renders captured and unavailable rows without changing broadcasts, and retains them after stop", async () => {
    const source = aStateMessage([]);
    const broadcast = aFakePlayerAssociationDataWith({
      discordName: "Team 2 player",
      gamertag: "Broadcast gamertag",
      currentRank: 1900,
    });
    const message = {
      ...source,
      data: {
        ...source.data,
        seriesStartedAt: "2026-11-06T00:00:00.000Z",
        playersAssociationData: { "team-2-player": broadcast },
      },
    };
    const originalAssociations = structuredClone(message.data.playersAssociationData);
    const response = aFakeLivePreSeriesResponseWith({
      guildId: message.data.guildId,
      queueNumber: message.data.queueNumber,
      seriesStartedAt: message.data.seriesStartedAt,
      players: [
        {
          playerId: "team-1-player",
          teamIndex: 0,
          rosterJoinedAt: message.data.seriesStartedAt,
          captured: null,
        },
        {
          playerId: "team-2-player",
          teamIndex: 1,
          rosterJoinedAt: message.data.seriesStartedAt,
          captured: { ...broadcast, gamertag: "Captured gamertag", currentRank: 1200 },
        },
      ],
    });
    const service = aFakeLivePreSeriesServiceWith({ status: "not-found" });
    const loadSpy = vi
      .spyOn(service, "getCapturedRoster")
      .mockResolvedValueOnce({ status: "not-found" })
      .mockResolvedValue(response);
    const heartbeat = {
      ...message,
      timestamp: "2026-11-06T00:01:00.000Z",
      data: { ...message.data, lastUpdateTime: "2026-11-06T00:01:00.000Z" },
    };
    const stopped = { ...message, data: { ...message.data, status: "stopped" as const } };
    const connection = await renderLiveTrackerWith(message, undefined, "?server=1&queue=3", {
      livePreSeriesService: service,
      additionalMessages: [heartbeat, stopped],
    });
    connection.step();
    expect(await screen.findByText("Captured player info is not available for this live series.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Player Info" })).toBeInTheDocument();
    expect(screen.getAllByText("Team 1 player")).toHaveLength(2);
    expect(screen.getAllByText("Team 2 player")).toHaveLength(2);
    const table = screen.getByRole("table", { name: "Player information" });
    const playerContainer = table.closest(`.${containerStyles.container}`);
    const overviewContainer = screen
      .getByRole("heading", { name: "Series overview" })
      .closest(`.${containerStyles.container}`);
    expect(playerContainer?.className).toBe(overviewContainer?.className);
    expect(playerContainer?.parentElement).toBe(overviewContainer?.parentElement);
    expect(within(table).getByText("Not connected")).toBeInTheDocument();
    expect(within(table).getByText("Captured gamertag")).toBeInTheDocument();
    expect(within(table).getByText("1,200")).toBeInTheDocument();
    expect(within(table).queryByText("Broadcast gamertag")).not.toBeInTheDocument();
    expect(within(table).queryByText("1,900")).not.toBeInTheDocument();
    expect(screen.queryByText("1500")).not.toBeInTheDocument();
    connection.step();
    connection.step();
    expect(screen.getByRole("heading", { name: "Player Info" })).toBeInTheDocument();
    expect(within(table).getByText("Captured gamertag")).toBeInTheDocument();
    expect(message.data.playersAssociationData).toEqual(originalAssociations);
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it("renders a wide default layout when no viewMode is provided and preserves standard compatibility", async () => {
    const renderTracker = async (search: string, expectedMode: "wide" | "standard"): Promise<void> => {
      window.history.pushState({}, "", `/tracker${search}`);

      const stateMessage: LiveTrackerStateMessage = {
        type: "state",
        timestamp: "2025-01-01T00:00:00.000Z",
        data: {
          type: "neatqueue",
          guildId: "1",
          guildIcon: null,
          guildName: "Guild 1",
          channelId: "2",
          queueNumber: 3,
          status: "active",
          lastUpdateTime: "2025-01-01T00:00:00.000Z",
          players: [
            { id: "team-1-player", discordUsername: "Team 1 player" },
            { id: "team-2-player", discordUsername: "Team 2 player" },
          ],
          teams: [
            { name: "Team 1", playerIds: ["team-1-player"] },
            { name: "Team 2", playerIds: ["team-2-player"] },
          ],
          substitutions: [],
          matchSummaries: [
            {
              matchId: "m1",
              gameTypeAndMap: "Slayer: Aquarius",
              gameType: "Slayer",
              gameMap: "Aquarius",
              gameMapThumbnailUrl: "data:,",
              duration: "10m 0s",
              gameScore: "50:49",
              gameSubScore: null,
              startTime: "2024-12-31T23:50:00.000Z",
              endTime: "2025-01-01T00:00:00.000Z",
              playerXuidToGametag: { "123": "GamerTag1" },
            },
          ],
          rawMatches: {},
          seriesScore: "0:0",
          playersAssociationData: {},
        },
      };

      const scenario = aFakeLiveTrackerScenarioWith({
        intervalMs: 10,
        frames: [stateMessage] satisfies readonly LiveTrackerMessage[],
      });

      const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });
      const connection = await liveTrackerService.connect({
        type: "team" as const,
        guildId: "1",
        queueNumber: "3",
      });
      vi.spyOn(liveTrackerService, "connect").mockImplementation(async () => Promise.resolve(connection));

      const LiveTracker = createLiveTracker({
        liveTrackerService,
        matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
        seriesMatchesService: aFakeSeriesMatchesServiceWith(),
        livePreSeriesService: aFakeLivePreSeriesServiceWith(),
      });

      render(<LiveTracker />);

      await waitFor(() => {
        expect(screen.getByText("Connecting...")).toBeInTheDocument();
      });

      if (!isSteppableLiveTrackerConnection(connection)) {
        throw new Error("Expected steppable fake connection in manual mode");
      }

      connection.step();
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Queue #3 Live Tracker" })).toBeInTheDocument();
      });
      expect(document.body.dataset.viewMode).toBe(expectedMode);
      const matchesHeading = await screen.findByRole("heading", { name: "Matches" });
      const seriesContent = Preconditions.checkExists(
        matchesHeading.closest(`.${containerStyles.container}`)?.parentElement,
        "Expected shared series content",
      );
      const statsContainers = seriesContent.querySelectorAll(`.${containerStyles.container}`);
      expect(statsContainers.length).toBeGreaterThanOrEqual(3);
      for (const container of statsContainers) {
        expect(container.classList.contains(containerStyles.wide)).toBe(expectedMode === "wide");
        expect(container).toHaveClass(seriesStatsStyles.noGutter);
      }
      cleanup();
    };

    await renderTracker("?server=1&queue=3", "wide");
    await renderTracker("?server=1&queue=3&viewMode=standard", "standard");
  });

  it("renders status and updates when messages arrive", async () => {
    window.history.pushState({}, "", "/tracker?server=1&queue=3");

    const stateMessage: LiveTrackerStateMessage = {
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        type: "neatqueue",
        guildId: "1",
        guildIcon: null,
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [
          { id: "team-1-player", discordUsername: "Team 1 player" },
          { id: "team-2-player", discordUsername: "Team 2 player" },
        ],
        teams: [
          { name: "Team 1", playerIds: ["team-1-player"] },
          { name: "Team 2", playerIds: ["team-2-player"] },
        ],
        substitutions: [],
        matchSummaries: [
          {
            matchId: "m1",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            playerXuidToGametag: { "123": "GamerTag1" },
          },
        ],
        rawMatches: {},
        seriesScore: "0:0",
        playersAssociationData: {},
      },
    };

    const scenario = aFakeLiveTrackerScenarioWith({
      intervalMs: 10,
      frames: [stateMessage] satisfies readonly LiveTrackerMessage[],
    });

    const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });

    const identity = {
      type: "team" as const,
      guildId: "1",
      queueNumber: "3",
    };

    const connection = await liveTrackerService.connect(identity);

    vi.spyOn(liveTrackerService, "connect").mockImplementation(async () => {
      return Promise.resolve(connection);
    });
    const LiveTracker = createLiveTracker({
      liveTrackerService,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
      livePreSeriesService: aFakeLivePreSeriesServiceWith(),
    });

    render(<LiveTracker />);

    await waitFor(() => {
      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    if (!isSteppableLiveTrackerConnection(connection)) {
      throw new Error("Expected steppable fake connection in manual mode");
    }

    connection.step();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Queue #3 Live Tracker" })).toBeInTheDocument();
    });

    expect(screen.getByText("Guild 1")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Series overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Matches")).toBeInTheDocument();
  });

  describe("selected analytics", () => {
    it("preserves overlay matrix selection on append but resets to Players when switching matches", async () => {
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const analyticsSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");
      const connection = await renderLiveTrackerWith(
        aStateMessage(["m1", "m2"]),
        analyticsService,
        "?server=1&queue=3&viewMode=streamer&showTabs=true",
        { additionalMessages: [aStateMessage(["m1", "m2", "m3"])] },
      );
      connection.step();
      const matchTabs = await screen.findAllByRole("button", { name: /Aquarius/ });
      fireEvent.click(Preconditions.checkExists(matchTabs[0]));
      const matrixTab = await screen.findByRole("tab", { name: "Kill Matrix" });
      fireEvent.click(matrixTab);
      await waitFor(() => {
        expect(analyticsSpy).toHaveBeenCalledWith(["m1"], ["killMatrix"]);
      });

      connection.step();
      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Aquarius/ })).toHaveLength(3);
      });
      expect(matrixTab).toBeInTheDocument();
      expect(matrixTab).toHaveAttribute("aria-selected", "true");
      expect(analyticsSpy).toHaveBeenCalledTimes(1);
      fireEvent.click(Preconditions.checkExists(matchTabs[1]));
      expect(screen.getByRole("tab", { name: "Players" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Kill Matrix" })).toHaveAttribute("aria-selected", "false");
      expect(analyticsSpy).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("tab", { name: "Kill Matrix" }));
      await waitFor(() => {
        expect(analyticsSpy).toHaveBeenNthCalledWith(2, ["m2"], ["killMatrix"]);
      });
    });

    it("loads Timeline only after selecting its tab, without eager hidden-module requests", async () => {
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const spy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

      const connection = await renderLiveTrackerWith(aStateMessage(["m1"]), analyticsService);
      connection.step();

      expect(spy).not.toHaveBeenCalled();
      const timelineTabs = await screen.findAllByRole("tab", { name: "Timeline" });
      fireEvent.click(timelineTabs[0]);
      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith(["m1"], ["scoreProgression"]);
      });
    });

    it("retains the selected series matrix while appending matches and loads only the new match", async () => {
      const firstMessage = aStateMessage(["m1"]);
      const appendedMessage = aStateMessage(["m1", "m2"]);
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const analyticsSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const getSeriesDetail = seriesMatchesService.getSeriesDetail.bind(seriesMatchesService);
      const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail").mockImplementation(async (...args) => {
        if (args[1].includes("m2")) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        return getSeriesDetail(...args);
      });

      const connection = await renderLiveTrackerWith(firstMessage, analyticsService, "?server=1&queue=3", {
        additionalMessages: [appendedMessage],
        seriesMatchesService,
      });
      connection.step();
      await screen.findAllByRole("tab", { name: "Kill Matrix" });
      const seriesMatrixTab = Preconditions.checkExists(
        screen.getAllByRole("tab", { name: "Kill Matrix" }).at(0),
        "Expected series matrix tab",
      );
      fireEvent.click(seriesMatrixTab);
      await waitFor(() => {
        expect(analyticsSpy).toHaveBeenCalledWith(["m1"], ["killMatrix"]);
      });

      connection.step();
      await waitFor(() => {
        expect(detailSpy).toHaveBeenCalledTimes(2);
      });
      expect(seriesMatrixTab).toHaveAttribute("aria-selected", "true");
      expect(analyticsSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(analyticsSpy).toHaveBeenCalledTimes(2);
      });
      expect(analyticsSpy).toHaveBeenNthCalledWith(2, ["m2"], ["killMatrix"]);
      expect(seriesMatrixTab).toHaveAttribute("aria-selected", "true");
    });

    it("does not fetch analytics for appended matches while the accumulated tab remains selected", async () => {
      const firstMessage = aStateMessage(["m1"]);
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const analyticsSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
      const connection = await renderLiveTrackerWith(firstMessage, analyticsService, "?server=1&queue=3", {
        additionalMessages: [aStateMessage(["m1", "m2"])],
        seriesMatchesService,
      });

      connection.step();
      await waitFor(() => {
        expect(detailSpy).toHaveBeenCalledTimes(1);
      });
      connection.step();
      await waitFor(() => {
        expect(document.getElementById("m2")).not.toBeNull();
      });

      expect(analyticsSpy).not.toHaveBeenCalled();
    });

    it.each(["normal", "streamer"])(
      "keeps retained stats visible across append failure and retry (%s)",
      async (viewMode) => {
        const analyticsService = aFakeMatchAnalyticsServiceWith();
        const analyticsSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");
        const seriesMatchesService = aFakeSeriesMatchesServiceWith();
        const getSeriesDetail = seriesMatchesService.getSeriesDetail.bind(seriesMatchesService);
        let failAppend = true;
        const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail").mockImplementation(async (...args) => {
          if (args[1].includes("m2") && failAppend) {
            failAppend = false;
            throw new Error("append details failed");
          }
          return getSeriesDetail(...args);
        });
        const connection = await renderLiveTrackerWith(
          aStateMessage(["m1"]),
          analyticsService,
          `?server=1&queue=3&viewMode=${viewMode}&showTabs=true`,
          {
            additionalMessages: [aStateMessage(["m1", "m2"])],
            seriesMatchesService,
          },
        );

        connection.step();
        if (viewMode === "streamer") {
          fireEvent.click(await screen.findByRole("button", { name: /Series score/ }));
        }
        const seriesMatrixTab = Preconditions.checkExists(
          (await screen.findAllByRole("tab", { name: "Kill Matrix" })).at(0),
          "Expected series matrix tab",
        );
        fireEvent.click(seriesMatrixTab);
        await waitFor(() => {
          expect(analyticsSpy).toHaveBeenCalledWith(["m1"], ["killMatrix"]);
        });
        connection.step();

        expect(await screen.findByText("append details failed")).toBeInTheDocument();
        expect(seriesMatrixTab).toBeInTheDocument();
        expect(seriesMatrixTab).toHaveAttribute("aria-selected", "true");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => {
          expect(detailSpy).toHaveBeenCalledTimes(3);
        });
        await waitFor(() => {
          expect(analyticsSpy).toHaveBeenCalledTimes(2);
        });
        expect(analyticsSpy).toHaveBeenNthCalledWith(2, ["m2"], ["killMatrix"]);
        expect(seriesMatrixTab).toBeInTheDocument();
        expect(seriesMatrixTab).toHaveAttribute("aria-selected", "true");
      },
    );
  });

  it("keeps substitution notices visible while changed-context details load, fail and recover", async () => {
    const message = aStateMessage(["m1"]);
    const substitutedMessage: LiveTrackerStateMessage = {
      ...message,
      data: {
        ...message.data,
        players: [...message.data.players, { id: "replacement", discordUsername: "Replacement" }],
        teams: [{ name: "Team 1", playerIds: ["replacement"] }, Preconditions.checkExists(message.data.teams[1])],
        substitutions: [
          {
            playerOutId: "team-1-player",
            playerInId: "replacement",
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: "2025-01-01T00:01:00.000Z",
          },
        ],
      },
    };
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getSeriesDetail = seriesMatchesService.getSeriesDetail.bind(seriesMatchesService);
    let rejectRefresh: ((error: Error) => void) | undefined;
    const detailSpy = vi
      .spyOn(seriesMatchesService, "getSeriesDetail")
      .mockImplementationOnce(getSeriesDetail)
      .mockImplementationOnce(
        async () =>
          new Promise((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      );
    const connection = await renderLiveTrackerWith(message, aFakeMatchAnalyticsServiceWith(), "?server=1&queue=3", {
      additionalMessages: [substitutedMessage],
      seriesMatchesService,
    });
    connection.step();
    await waitFor(() => {
      expect(document.getElementById("m1")).not.toBeNull();
    });
    connection.step();
    await screen.findByText("Loading match details...");
    expect(document.getElementById("m1")).toBeNull();
    expect(screen.getAllByText(/subbed in for/)).toHaveLength(1);
    Preconditions.checkExists(rejectRefresh)(new Error("context refresh failed"));
    await screen.findByText("context refresh failed");
    expect(screen.getAllByText(/subbed in for/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(document.getElementById("m1")).not.toBeNull();
    });
    expect(detailSpy).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText(/subbed in for/)).toHaveLength(1);
  });

  it("shows an error state when the tracker is not found", async () => {
    window.history.pushState({}, "", "/tracker?server=1&queue=3");

    const notFoundConnection: LiveTrackerConnection = {
      subscribe: () => ({ unsubscribe: () => undefined }),
      subscribeStatus: (listener: LiveTrackerStatusListener) => {
        queueMicrotask(() => {
          listener("not_found");
        });
        return { unsubscribe: () => undefined };
      },
      disconnect: () => undefined,
    };

    const liveTrackerService = aFakeLiveTrackerServiceWith();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(notFoundConnection);
    const LiveTracker = createLiveTracker({
      liveTrackerService,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
      livePreSeriesService: aFakeLivePreSeriesServiceWith(),
    });

    render(<LiveTracker />);

    await waitFor(() => {
      expect(screen.getByText("Connection Failed")).toBeInTheDocument();
    });

    expect(screen.getByText("No active tracker found for this queue. Start a tracker first.")).toBeInTheDocument();
  });
});
