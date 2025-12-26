// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerListener,
  LiveTrackerService,
  LiveTrackerStatusListener,
  LiveTrackerSubscription,
} from "../../../services/live-tracker/types";
import type { Services } from "../../../services/install";
import { TrackerWebSocketDemo } from "../tracker-websocket-demo";

class TestConnection implements LiveTrackerConnection {
  private readonly messageListeners = new Set<LiveTrackerListener>();
  private readonly statusListeners = new Set<LiveTrackerStatusListener>();

  public subscribe(listener: LiveTrackerListener): LiveTrackerSubscription {
    this.messageListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.messageListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: LiveTrackerStatusListener): LiveTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    for (const listener of this.statusListeners) {
      listener("disconnected");
    }

    this.messageListeners.clear();
    this.statusListeners.clear();
  }

  public emitStatus(status: LiveTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public emitMessage(message: LiveTrackerMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

class TestLiveTrackerService implements LiveTrackerService {
  public readonly connection: TestConnection;

  public constructor(connection: TestConnection) {
    this.connection = connection;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public connect(_identity: LiveTrackerIdentity): LiveTrackerConnection {
    return this.connection;
  }
}

describe("TrackerWebSocketDemo", () => {
  it("renders status and updates when messages arrive", async () => {
    window.history.pushState({}, "", "/tracker?guildId=1&channelId=2&queueNumber=3");

    const connection = new TestConnection();
    const services: Services = {
      liveTrackerService: new TestLiveTrackerService(connection),
    };

    render(<TrackerWebSocketDemo apiHost="example.com" servicesOverride={services} />);

    await waitFor(() => {
      expect(screen.getByText("Status:")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    connection.emitStatus("connected");

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    connection.emitMessage({
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
    });

    await waitFor(() => {
      expect(screen.getByText(/"type": "state"/)).toBeInTheDocument();
    });
  });
});
