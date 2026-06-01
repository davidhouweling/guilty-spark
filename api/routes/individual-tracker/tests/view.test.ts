import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerViewStateWith,
  type FakeIndividualTrackerDO,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import type { IndividualTrackerDO } from "../../../worker";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";

function envWithTrackerDo(stub: FakeIndividualTrackerDO): Env {
  const id = aFakeDurableObjectId();
  return aFakeEnvWith({
    INDIVIDUAL_TRACKER_DO: {
      idFromName: () => id,
      idFromString: () => id,
      newUniqueId: () => id,
      getByName: () => stub,
      get: () => stub,
      jurisdiction: () => ({}) as DurableObjectNamespace<IndividualTrackerDO>,
    },
  });
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

describe("/api/individual-tracker view route", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 404 when the tracker does not exist", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/unknown/view"), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 200 with the view (matches + isLive from the row) for a running tracker without a session", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          status: "active",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
          matches: [
            {
              matchId: "match-1",
              startTime: "2024-11-26T11:00:00.000Z",
              endTime: "2024-11-26T11:10:00.000Z",
              mapAssetId: "map-1",
              modeAssetId: "mode-1",
            },
          ],
        }),
      },
    });
    const localEnv = envWithTrackerDo(doStub);

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t1",
      UserId: "user-123",
      Gamertag: "MyTag",
      Status: "active",
      IsLive: 1,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t1/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.trackerId).toBe("t1");
    expect(body.view.gamertag).toBe("MyTag");
    expect(body.view.status).toBe("active");
    expect(body.view.isLive).toBe(true);
    expect(body.view.matches).toHaveLength(1);
    expect(body.view.matches[0]?.matchId).toBe("match-1");
    expect(body.view.lastMatchDiscoveredAt).toBe("2024-11-26T11:55:00.000Z");
  });

  it("returns 200 with empty matches and the row's status when the DO has no state", async () => {
    const doStub = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const localEnv = envWithTrackerDo(doStub);

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t2",
      UserId: "user-123",
      Gamertag: "StoppedTag",
      Status: "stopped",
      IsLive: 0,
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("/api/individual-tracker/t2/view"), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerViewResponse>();
    expect(body.view.status).toBe("stopped");
    expect(body.view.isLive).toBe(false);
    expect(body.view.matches).toEqual([]);
    expect(body.view.lastMatchDiscoveredAt).toBeNull();
  });
});
