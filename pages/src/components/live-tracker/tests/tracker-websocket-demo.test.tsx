import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerConnection, SteppableLiveTrackerConnection } from "../../../services/live-tracker/types";
import type { Services } from "../../../services/types";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import { aFakeLiveTrackerServiceWith } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { TrackerWebSocketDemoFactory } from "../create";

function isSteppableLiveTrackerConnection(
  connection: LiveTrackerConnection,
): connection is SteppableLiveTrackerConnection {
  return "step" in connection && typeof connection.step === "function";
}

describe("TrackerWebSocketDemo", () => {
  it("renders status and updates when messages arrive", async () => {
    window.history.pushState({}, "", "/tracker?guildId=1&channelId=2&queueNumber=3");

    const stateMessage: LiveTrackerStateMessage = {
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        userId: "u",
        guildId: "1",
        channelId: "2",
        queueNumber: 3,
        status: "tracking",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: {},
        teams: [],
        discoveredMatches: {},
      },
    };

    const scenario = aFakeLiveTrackerScenarioWith({
      intervalMs: 10,
      frames: [stateMessage] satisfies readonly LiveTrackerMessage[],
    });

    const liveTrackerService = aFakeLiveTrackerServiceWith({ scenario, mode: "manual" });

    const identity = {
      guildId: "1",
      channelId: "2",
      queueNumber: "3",
    };

    const connection = liveTrackerService.connect(identity);

    vi.spyOn(liveTrackerService, "connect").mockImplementation(() => {
      return connection;
    });

    const services: Services = {
      liveTrackerService,
    };

    render(<TrackerWebSocketDemoFactory services={services} />);

    await waitFor(() => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    if (!isSteppableLiveTrackerConnection(connection)) {
      throw new Error("Expected steppable fake connection in manual mode");
    }

    connection.step();

    await waitFor(() => {
      expect(screen.getByText("Teams")).toBeInTheDocument();
    });

    expect(screen.getByText("Matches")).toBeInTheDocument();
  });
});
