import { describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import { aFakeLivePreSeriesPlayerWith } from "@guilty-spark/shared/contracts/stats/fakes/pre-series.fake";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeWebSocketHibernationAdapter } from "../../../base/fakes/websocket-hibernation-adapter.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import { LiveTrackerDO } from "../live-tracker-do";
import type { LiveTrackerState } from "../types";
import { aFakeLiveTrackerStateWith } from "../fakes/live-tracker-do.fake";

function createTracker(trackerState: LiveTrackerState | null): {
  haloSpy: MockInstance<Services["haloService"]["getMatchDetails"]>;
  discordSpy: MockInstance<Services["discordService"]["getGuildMember"]>;
  errorSpy: MockInstance<Services["logService"]["error"]>;
  rawSpy: MockInstance<Env["APP_DATA"]["get"]>;
  writeSpy: MockInstance<DurableObjectStorage["put"]>;
  fetch: () => Promise<Response>;
} {
  const state = aFakeDurableObjectStateWith();
  const env = aFakeEnvWith();
  const services = installFakeServicesWith({ env });
  vi.spyOn(state.storage, "get").mockResolvedValue(trackerState as never);
  const tracker = new LiveTrackerDO(state, env, () => services, aFakeWebSocketHibernationAdapter());
  const haloSpy = vi.spyOn(services.haloService, "getMatchDetails");
  const discordSpy = vi.spyOn(services.discordService, "getGuildMember");
  const errorSpy = vi.spyOn(services.logService, "error");
  const rawSpy = vi.spyOn(env.APP_DATA, "get");
  const writeSpy = vi.spyOn(state.storage, "put");
  return {
    haloSpy,
    discordSpy,
    errorSpy,
    rawSpy,
    writeSpy,
    fetch: async (): Promise<Response> => tracker.fetch(new Request("https://live-tracker/pre-series")),
  };
}

describe("LiveTrackerDO captured pre-series batch", () => {
  it("returns all eight captured players without refreshing values or exposing raw data", async () => {
    const captured = Preconditions.checkExists(aFakeLivePreSeriesPlayerWith().captured);
    const ids = Array.from({ length: 8 }, (_, index) => `player-${index.toString()}`);
    const trackerState = aFakeLiveTrackerStateWith({
      startTime: "2026-01-01T00:00:00.000Z",
      teams: [
        { name: "Eagle", playerIds: ids.slice(0, 4) },
        { name: "Cobra", playerIds: ids.slice(4) },
      ],
      playersAssociationData: Object.fromEntries(ids.map((id) => [id, { ...captured, discordId: id }])),
      matchIds: ["raw-match-id"],
    });
    const tracker = createTracker(trackerState);
    const response = await tracker.fetch();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data = await livePreSeriesContract.fromResponse(response);
    expect(data.status).toBe("resolved");
    if (data.status !== "resolved") {
      throw new Error("Expected captured roster");
    }
    expect(data.players).toHaveLength(8);
    expect(data.players).toEqual(
      ids.map((id, index) => ({
        playerId: id,
        teamIndex: index < 4 ? 0 : 1,
        rosterJoinedAt: trackerState.startTime,
        captured: { ...captured, discordId: id },
      })),
    );
    expect(Object.keys(data).sort()).toEqual(
      ["status", "guildId", "queueNumber", "trackerStatus", "seriesStartedAt", "rosterRevision", "players"].sort(),
    );
    expect(tracker.haloSpy).not.toHaveBeenCalled();
    expect(tracker.discordSpy).not.toHaveBeenCalled();
    expect(tracker.rawSpy).not.toHaveBeenCalled();
    expect(tracker.writeSpy).not.toHaveBeenCalled();
    trackerState.lastUpdateTime = "2026-01-02T00:00:00.000Z";
    expect(await livePreSeriesContract.fromResponse(await tracker.fetch())).toEqual(data);
  });

  it("selects only the substituted current roster and its incoming captured values", async () => {
    const captured = Preconditions.checkExists(aFakeLivePreSeriesPlayerWith().captured);
    const state = aFakeLiveTrackerStateWith({
      teams: [{ name: "Eagle", playerIds: ["incoming", "missing"] }],
      playersAssociationData: { outgoing: captured, incoming: { ...captured, discordId: "incoming", esra: 1234 } },
      substitutions: [
        {
          playerOutId: "outgoing",
          playerInId: "incoming",
          teamIndex: 0,
          teamName: "Eagle",
          timestamp: "2026-01-01T01:00:00.000Z",
        },
      ],
      isPaused: true,
    });
    const tracker = createTracker(state);
    const data = await livePreSeriesContract.fromResponse(await tracker.fetch());
    if (data.status !== "resolved") {
      throw new Error("Expected captured roster");
    }
    expect(data.trackerStatus).toBe("paused");
    expect(data.players).toEqual([
      {
        playerId: "incoming",
        teamIndex: 0,
        rosterJoinedAt: state.substitutions[0]?.timestamp,
        captured: { ...captured, discordId: "incoming", esra: 1234 },
      },
      { playerId: "missing", teamIndex: 0, rosterJoinedAt: state.startTime, captured: null },
    ]);
    expect(tracker.errorSpy).not.toHaveBeenCalled();
    state.teams[0]?.playerIds.splice(0, 1, "outgoing");
    const next = await livePreSeriesContract.fromResponse(await tracker.fetch());
    expect(next.status === "resolved" && next.rosterRevision).not.toEqual(data.rosterRevision);
  });

  it.each(["not-found", "stopped"] as const)("returns explicit %s without refresh or logged errors", async (status) => {
    const tracker = createTracker(status === "stopped" ? aFakeLiveTrackerStateWith({ status }) : null);
    const response = await tracker.fetch();
    expect(response.status).toBe(status === "stopped" ? 410 : 404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual({ status });
    expect(tracker.haloSpy).not.toHaveBeenCalled();
    expect(tracker.errorSpy).not.toHaveBeenCalled();
  });
});
