import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";

import type {
  LiveTrackerMatchSummary,
  LiveTrackerMessage,
  LiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/types";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
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
import { createLiveTracker } from "../create";

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <div data-testid="team-icon">Team</div>,
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
  });

  it("appends upcoming map tiles to the completed score list", async () => {
    const message = aStateMessage(["m1"]);
    const match = message.data.matchSummaries.at(0);
    if (match == null) {
      throw new Error("Expected match summary");
    }
    const connection = await renderLiveTrackerWith({
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
    });
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
    });

    render(<LiveTracker />);

    await waitFor(() => {
      expect(screen.getByText("Connection Failed")).toBeInTheDocument();
    });

    expect(screen.getByText("No active tracker found for this queue. Start a tracker first.")).toBeInTheDocument();
  });
});
