import { describe, expect, it } from "vitest";

import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import { FakeLiveTrackerService } from "../live-tracker.fake";
import type { LiveTrackerConnection, SteppableLiveTrackerConnection } from "../../types";

function isSteppableLiveTrackerConnection(
  connection: LiveTrackerConnection,
): connection is SteppableLiveTrackerConnection {
  return "step" in connection && typeof connection.step === "function";
}

describe("FakeLiveTrackerService (fake mode)", () => {
  it("does not emit frames until stepped, and does not overwrite stopped status", async () => {
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
        players: [],
        teams: [],
        substitutions: [],
        discoveredMatches: [],
        rawMatches: {},
        seriesScore: "🦅 0:0 🐍",
      },
    };

    const stoppedStateMessage: LiveTrackerStateMessage = {
      type: "state",
      timestamp: "2025-01-01T00:01:00.000Z",
      data: {
        ...stateMessage.data,
        status: "stopped",
      },
    };

    const scenario = {
      intervalMs: 10,
      frames: [stateMessage, stoppedStateMessage] satisfies readonly LiveTrackerMessage[],
    };

    const service = new FakeLiveTrackerService(scenario, { mode: "manual" });

    const messages: LiveTrackerMessage[] = [];
    const statuses: string[] = [];

    const connection = service.connect({ guildId: "1", queueNumber: "3" });

    connection.subscribe((message) => {
      messages.push(message);
    });

    connection.subscribeStatus((status) => {
      statuses.push(status);
    });

    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        resolve();
      });
    });

    expect(statuses).toEqual(["connecting", "connected"]);
    expect(messages).toEqual([]);

    if (!isSteppableLiveTrackerConnection(connection)) {
      throw new Error("Expected steppable fake connection in manual mode");
    }

    connection.step();
    expect(messages.length).toBe(1);

    connection.step();

    expect(statuses.includes("stopped")).toBe(true);

    const lastStatus = statuses[statuses.length - 1];
    expect(lastStatus).toBe("stopped");
  });
});
