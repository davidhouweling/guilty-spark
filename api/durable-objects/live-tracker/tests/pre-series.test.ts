import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("LiveTrackerDO captured pre-series batch", () => {
  let liveTrackerDO: LiveTrackerDO;
  let services: Services;
  let storage: DurableObjectStorage;
  let env: Env;
  let storageGetSpy: MockInstance<(key: string) => Promise<LiveTrackerState | null>>;
  let storagePutSpy: MockInstance<DurableObjectStorage["put"]>;
  let storageDeleteAllSpy: MockInstance<DurableObjectStorage["deleteAll"]>;
  let getMatchDetailsSpy: MockInstance<Services["haloService"]["getMatchDetails"]>;
  let getGuildMemberSpy: MockInstance<Services["discordService"]["getGuildMember"]>;
  let logErrorSpy: MockInstance<Services["logService"]["error"]>;
  let appDataGetSpy: MockInstance<Env["APP_DATA"]["get"]>;

  beforeEach(() => {
    const state = aFakeDurableObjectStateWith();
    ({ storage } = state);
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    storageGetSpy = vi.spyOn(storage, "get");
    storageGetSpy.mockResolvedValue(aFakeLiveTrackerStateWith());
    storagePutSpy = vi.spyOn(storage, "put");
    storageDeleteAllSpy = vi.spyOn(storage, "deleteAll").mockImplementation(async () => {
      storageGetSpy.mockResolvedValue(null);
      await Promise.resolve();
    });
    getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails");
    getGuildMemberSpy = vi.spyOn(services.discordService, "getGuildMember");
    logErrorSpy = vi.spyOn(services.logService, "error");
    appDataGetSpy = vi.spyOn(env.APP_DATA, "get");
    liveTrackerDO = new LiveTrackerDO(state, env, () => services, aFakeWebSocketHibernationAdapter());
  });

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
    storageGetSpy.mockResolvedValue(trackerState);
    const response = await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series"));
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
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    expect(getGuildMemberSpy).not.toHaveBeenCalled();
    expect(appDataGetSpy).not.toHaveBeenCalled();
    expect(storagePutSpy).not.toHaveBeenCalled();
    trackerState.lastUpdateTime = "2026-01-02T00:00:00.000Z";
    expect(
      await livePreSeriesContract.fromResponse(
        await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series")),
      ),
    ).toEqual(data);
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
    storageGetSpy.mockResolvedValue(state);
    const data = await livePreSeriesContract.fromResponse(
      await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series")),
    );
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
    expect(logErrorSpy).not.toHaveBeenCalled();
    state.teams[0]?.playerIds.splice(0, 1, "outgoing");
    const next = await livePreSeriesContract.fromResponse(
      await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series")),
    );
    expect(next.status === "resolved" && next.rosterRevision).not.toEqual(data.rosterRevision);
  });

  it.each(["not-found", "stopped"] as const)("returns explicit %s without refresh or logged errors", async (status) => {
    storageGetSpy.mockResolvedValue(status === "stopped" ? aFakeLiveTrackerStateWith({ status }) : null);
    const response = await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual({ status: "not-found" });
    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it("returns not-found after a real stop removes the captured roster without retaining a marker", async () => {
    expect((await liveTrackerDO.fetch(new Request("https://live-tracker/stop"))).status).toBe(200);
    expect(storageDeleteAllSpy).toHaveBeenCalledOnce();
    const response = await liveTrackerDO.fetch(new Request("https://live-tracker/pre-series"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual({ status: "not-found" });
    expect(storagePutSpy).not.toHaveBeenCalled();
  });
});
