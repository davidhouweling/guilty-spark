import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerConnection, SteppableLiveTrackerConnection } from "../../../services/live-tracker/types";
import type { Services } from "../../../services/types";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import { aFakeLiveTrackerServiceWith } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { LiveTrackerFactory } from "../create";

function isSteppableLiveTrackerConnection(
  connection: LiveTrackerConnection,
): connection is SteppableLiveTrackerConnection {
  return "step" in connection && typeof connection.step === "function";
}

describe("LiveTracker", () => {
  it("renders status and updates when messages arrive", async () => {
    window.history.pushState({}, "", "/tracker?server=1&queue=3");

    const stateMessage: LiveTrackerStateMessage = {
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        guildId: "1",
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [{ id: "p1", discordUsername: "Player 1" }],
        teams: [],
        substitutions: [],
        discoveredMatches: [
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
        seriesScore: "🦅 0:0 🐍",
        medalMetadata: {},
      },
    };

    const scenario = aFakeLiveTrackerScenarioWith({
      intervalMs: 10,
      frames: [stateMessage] satisfies readonly LiveTrackerMessage[],
    });

    const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });

    const identity = {
      guildId: "1",
      queueNumber: "3",
    };

    const connection = liveTrackerService.connect(identity);

    vi.spyOn(liveTrackerService, "connect").mockImplementation(() => {
      return connection;
    });

    const services: Services = {
      liveTrackerService,
    };

    render(<LiveTrackerFactory services={services} />);

    await waitFor(() => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    if (!isSteppableLiveTrackerConnection(connection)) {
      throw new Error("Expected steppable fake connection in manual mode");
    }

    connection.step();

    await waitFor(() => {
      expect(screen.getByText(/Series overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Matches")).toBeInTheDocument();
  });
});
