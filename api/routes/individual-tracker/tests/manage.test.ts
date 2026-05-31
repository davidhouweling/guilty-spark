import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type {
  StopTrackerResponse,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { ErrorResponse } from "@guilty-spark/shared/contracts/error";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerStateWith,
  type FakeIndividualTrackerDO,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import type { IndividualTrackerDO } from "../../../worker";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { IndividualTrackerService } from "../../../services/individual-tracker/individual-tracker";
import { TrackerLimitReachedError, TrackerNotFoundError } from "../../../services/individual-tracker/errors";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";

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

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/individual-tracker manage routes", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 401 on start when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postRequest("/api/individual-tracker/manage/start", { gamertag: "Foo" }),
      env,
    )) as Response;

    expect(res.status).toBe(401);
  });

  it("returns 401 on list trackers when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/trackers", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(401);
  });

  it("starts a tracker: resolves the gamertag, creates the registry row, calls the DO start, returns the tracker", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      startResponse: {
        success: true,
        state: aFakeIndividualTrackerStateWith({ trackerId: "new-tracker", gamertag: "ResolvedTag" }),
      },
    });
    const startSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = envWithTrackerDo(doStub);

    const row = aFakeIndividualTrackersRow({
      TrackerId: "new-tracker",
      Gamertag: "ResolvedTag",
      Xuid: "xuid-1",
      Status: "active",
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.xboxService, "getUserByGamertag").mockResolvedValue({
        xuid: "xuid-1",
        gamertag: "ResolvedTag",
      });
      vi.spyOn(services.individualTrackerService, "createTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postRequest("/api/individual-tracker/manage/start", { gamertag: "resolvedtag" }),
      localEnv,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerResponse>();
    expect(body.tracker.trackerId).toBe("new-tracker");
    expect(body.tracker.gamertag).toBe("ResolvedTag");
    expect(body.tracker.status).toBe("active");
    expect(startSpy).toHaveBeenCalledWith("http://do/start", expect.objectContaining({ method: "POST" }));
  });

  it("returns 429 on start when the user is at the tracker limit", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.xboxService, "getUserByGamertag").mockResolvedValue({ xuid: "xuid-6", gamertag: "Sixth" });
      vi.spyOn(services.individualTrackerService, "createTracker").mockRejectedValue(new TrackerLimitReachedError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postRequest("/api/individual-tracker/manage/start", { gamertag: "sixth" }),
      env,
    )) as Response;

    expect(res.status).toBe(429);
    const body = await res.json<ErrorResponse>();
    expect(body.error).toContain("limit");
  });

  it("returns 400 on start when the gamertag is missing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/manage/start", {}), env)) as Response;

    expect(res.status).toBe(400);
  });

  it("returns 404 on stop when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/not-mine/stop", {}), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("stops a tracker: calls the DO stop and marks the registry row stopped", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    const stopSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = envWithTrackerDo(doStub);

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active" });
    let markStoppedSpy: MockInstance<IndividualTrackerService["markTrackerStopped"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      markStoppedSpy = vi
        .spyOn(services.individualTrackerService, "markTrackerStopped")
        .mockResolvedValue({ ...row, Status: "stopped" });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/stop", {}), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<StopTrackerResponse>();
    expect(body.success).toBe(true);
    expect(stopSpy).toHaveBeenCalledWith("http://do/stop", expect.objectContaining({ method: "POST" }));
    expect(markStoppedSpy).not.toBeNull();
  });

  it("lists the user's trackers hydrated with DO status", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      statusResponse: { state: aFakeIndividualTrackerStateWith({ trackerId: "t1", status: "active" }) },
    });
    const localEnv = envWithTrackerDo(doStub);

    const rows = [
      aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active" }),
      aFakeIndividualTrackersRow({ TrackerId: "t2", UserId: "user-123", Status: "stopped" }),
    ];
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "listTrackers").mockResolvedValue(rows);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/trackers", {
      method: "GET",
      headers: { Origin: localEnv.PAGES_URL },
    });
    const res = (await router.fetch(req, localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackersResponse>();
    expect(body.trackers).toHaveLength(2);
    expect(body.trackers[0]?.trackerId).toBe("t1");
    expect(body.trackers[0]?.state).not.toBeNull();
  });

  it("returns 404 on status when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/not-mine/status", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns the DO sanitized status for an owned tracker", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      statusResponse: {
        state: aFakeIndividualTrackerStateWith({ trackerId: "t1", gamertag: "MyTag", status: "active" }),
      },
    });
    const localEnv = envWithTrackerDo(doStub);

    const row = aFakeIndividualTrackersRow({
      TrackerId: "t1",
      UserId: "user-123",
      Gamertag: "MyTag",
      Status: "active",
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/t1/status", { method: "GET" });
    const res = (await router.fetch(req, localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerResponse>();
    expect(body.tracker.trackerId).toBe("t1");
    expect(body.tracker.state?.gamertag).toBe("MyTag");
  });
});
