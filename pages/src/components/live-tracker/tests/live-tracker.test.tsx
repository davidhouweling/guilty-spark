import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

import type {
  LiveTrackerMatchSummary,
  LiveTrackerMessage,
  LiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/types";
import type {
  LiveTrackerConnection,
  LiveTrackerStatusListener,
  SteppableLiveTrackerConnection,
} from "../../../services/live-tracker/types";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import { aFakeLiveTrackerServiceWith } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { createLiveTracker } from "../create";

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
      players: [],
      teams: [],
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
): Promise<SteppableLiveTrackerConnection> {
  window.history.pushState({}, "", "/tracker?server=1&queue=3");

  const scenario = aFakeLiveTrackerScenarioWith({
    intervalMs: 10,
    frames: [stateMessage] satisfies readonly LiveTrackerMessage[],
  });
  const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });
  const connection = await liveTrackerService.connect({ type: "team" as const, guildId: "1", queueNumber: "3" });
  vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
  const LiveTracker = createLiveTracker({
    liveTrackerService,
    matchAnalyticsService: analyticsService,
    medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
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
        players: [{ id: "p1", discordUsername: "Player 1" }],
        teams: [],
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
      medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
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
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Series overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Matches")).toBeInTheDocument();
  });

  describe("analytics effect", () => {
    it("calls getBatchMatchAnalytics for match IDs that have rawMatchStats", async () => {
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const spy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

      const connection = await renderLiveTrackerWith(aStateMessage(["m1"], ["m1"]), analyticsService);
      connection.step();

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith(["m1"]);
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not call getBatchMatchAnalytics when no matches have rawMatchStats", async () => {
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const spy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

      const connection = await renderLiveTrackerWith(aStateMessage(["m1"], []), analyticsService);
      connection.step();

      await waitFor(() => expect(screen.getByText(/Series overview/i)).toBeInTheDocument());
      expect(spy).not.toHaveBeenCalled();
    });

    it("chunks analytics requests at 30 match IDs per batch", async () => {
      const matchIds = Array.from({ length: 31 }, (_, i) => `m${(i + 1).toString()}`);
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const spy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

      const connection = await renderLiveTrackerWith(aStateMessage(matchIds, matchIds), analyticsService);
      connection.step();

      await waitFor(() => {
        expect(spy).toHaveBeenCalledTimes(2);
      });
      expect(spy.mock.calls[0]?.[0]).toHaveLength(30);
      expect(spy.mock.calls[1]?.[0]).toHaveLength(1);
    });

    it("does not re-fetch analytics for match IDs already fetched", async () => {
      const analyticsService = aFakeMatchAnalyticsServiceWith();
      const spy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

      const connection = await renderLiveTrackerWith(aStateMessage(["m1"], ["m1"]), analyticsService);
      connection.step();

      await waitFor(() => {
        expect(spy).toHaveBeenCalledTimes(1);
      });
      connection.step();

      await waitFor(() => {
        expect(screen.getAllByText(/Series overview/i).length).toBeGreaterThan(0);
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });
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
      medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
    });

    render(<LiveTracker />);

    await waitFor(() => {
      expect(screen.getByText("Connection Failed")).toBeInTheDocument();
    });

    expect(screen.getByText("No active tracker found for this queue. Start a tracker first.")).toBeInTheDocument();
  });
});
