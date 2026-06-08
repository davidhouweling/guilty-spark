import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type {
  DeleteTrackerResponse,
  EndSeriesResponse,
  SelectMatchesResponse,
  StopTrackerResponse,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { ErrorResponse } from "@guilty-spark/shared/contracts/error";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerStateWith,
  type FakeIndividualTrackerDO,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { IndividualTrackerService } from "../../../services/individual-tracker/individual-tracker";
import { TrackerLimitReachedError, TrackerNotFoundError } from "../../../services/individual-tracker/errors";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";

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
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

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
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active" });
    let markStatusSpy: MockInstance<IndividualTrackerService["markTrackerStatus"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      markStatusSpy = vi
        .spyOn(services.individualTrackerService, "markTrackerStatus")
        .mockResolvedValue({ ...row, Status: "stopped" });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/stop", {}), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<StopTrackerResponse>();
    expect(body.success).toBe(true);
    expect(stopSpy).toHaveBeenCalledWith("http://do/stop", expect.objectContaining({ method: "POST" }));
    expect(Preconditions.checkExists(markStatusSpy, "markStatus spy")).toHaveBeenCalledWith(row, "stopped");
  });

  it("returns 404 on pause when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/not-mine/pause", {}), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("pauses a tracker: calls the DO pause, marks the registry row paused, returns the tracker", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      pauseResponse: {
        success: true,
        state: aFakeIndividualTrackerStateWith({ trackerId: "t1", status: "paused", isPaused: true }),
      },
    });
    const pauseSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active" });
    let markStatusSpy: MockInstance<IndividualTrackerService["markTrackerStatus"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      markStatusSpy = vi
        .spyOn(services.individualTrackerService, "markTrackerStatus")
        .mockResolvedValue({ ...row, Status: "paused" });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/pause", {}), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerResponse>();
    expect(body.tracker.status).toBe("paused");
    expect(pauseSpy).toHaveBeenCalledWith("http://do/pause", expect.objectContaining({ method: "POST" }));
    expect(Preconditions.checkExists(markStatusSpy, "markStatus spy")).toHaveBeenCalledWith(row, "paused");
  });

  it("returns 404 on resume when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/not-mine/resume", {}), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("resumes a tracker: calls the DO resume, marks the registry row active, returns the tracker", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      resumeResponse: {
        success: true,
        state: aFakeIndividualTrackerStateWith({ trackerId: "t1", status: "active", isPaused: false }),
      },
    });
    const resumeSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "paused" });
    let markStatusSpy: MockInstance<IndividualTrackerService["markTrackerStatus"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      markStatusSpy = vi
        .spyOn(services.individualTrackerService, "markTrackerStatus")
        .mockResolvedValue({ ...row, Status: "active" });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/resume", {}), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerResponse>();
    expect(body.tracker.status).toBe("active");
    expect(resumeSpy).toHaveBeenCalledWith("http://do/resume", expect.objectContaining({ method: "POST" }));
    expect(Preconditions.checkExists(markStatusSpy, "markStatus spy")).toHaveBeenCalledWith(row, "active");
  });

  it("returns 404 on select-active when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "setLiveTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postRequest("/api/individual-tracker/manage/select-active", { trackerId: "not-mine" }),
      env,
    )) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 400 on select-active when the trackerId is missing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/manage/select-active", {}), env)) as Response;

    expect(res.status).toBe(400);
  });

  it("selects the active tracker: calls setLiveIndividualTracker via the service and returns the now-live tracker", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      statusResponse: { state: aFakeIndividualTrackerStateWith({ trackerId: "t1", status: "active" }) },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const liveRow = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active", IsLive: 1 });
    let setLiveSpy: MockInstance<IndividualTrackerService["setLiveTracker"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      setLiveSpy = vi.spyOn(services.individualTrackerService, "setLiveTracker").mockResolvedValue(liveRow);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      postRequest("/api/individual-tracker/manage/select-active", { trackerId: "t1" }),
      localEnv,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerResponse>();
    expect(body.tracker.trackerId).toBe("t1");
    expect(body.tracker.isLive).toBe(true);
    expect(Preconditions.checkExists(setLiveSpy, "setLive spy")).toHaveBeenCalledWith("user-123", "t1");
  });

  it("lists the user's trackers hydrated with DO status", async () => {
    const doStub = aFakeIndividualTrackerDOWith({
      statusResponse: { state: aFakeIndividualTrackerStateWith({ trackerId: "t1", status: "active" }) },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

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
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

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

  it("returns 401 on select matches when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/t1/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: ["match-1"] }),
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(401);
  });

  it("returns 404 on select matches when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/t1/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: ["match-1"] }),
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(404);
  });

  it("calls the DO select-matches endpoint and returns success", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    const fetchSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/t1/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: ["match-1", "match-2"] }),
    });
    const res = (await router.fetch(req, localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<SelectMatchesResponse>();
    expect(body.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("http://do/select-matches", expect.objectContaining({ method: "PUT" }));
  });

  it("returns 404 on select matches when DO has no state (not yet started)", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    vi.spyOn(doStub, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/manage/t1/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: ["m1"] }),
    });
    const res = (await router.fetch(req, localEnv)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 404 on end-series when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/not-mine/end-series", {}), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("ends a series: calls the DO end-series and returns success", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    const fetchSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/end-series", {}), localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<EndSeriesResponse>();
    expect(body.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("http://do/end-series", expect.objectContaining({ method: "POST" }));
  });

  it("returns 409 on end-series when DO has no active series", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    vi.spyOn(doStub, "fetch").mockResolvedValue(new Response("No active series", { status: 409 }));
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(postRequest("/api/individual-tracker/t1/end-series", {}), localEnv)) as Response;

    expect(res.status).toBe(409);
  });

  it("returns 404 on delete when the tracker is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockRejectedValue(new TrackerNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/not-mine", { method: "DELETE" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(404);
  });

  it("deletes a tracker: verifies ownership, stops the DO, calls deleteTracker, returns success", async () => {
    const doStub = aFakeIndividualTrackerDOWith();
    const fetchSpy: MockInstance<FakeIndividualTrackerDO["fetch"]> = vi.spyOn(doStub, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) });

    const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-123", Status: "active" });
    let deleteTrackerSpy: MockInstance<IndividualTrackerService["deleteTracker"]> | null = null;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env: localEnv });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith({ userId: "user-123" }));
      vi.spyOn(services.individualTrackerService, "getOwnedTracker").mockResolvedValue(row);
      deleteTrackerSpy = vi.spyOn(services.individualTrackerService, "deleteTracker").mockResolvedValue(undefined);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/t1", { method: "DELETE" });
    const res = (await router.fetch(req, localEnv)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<DeleteTrackerResponse>();
    expect(body.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("http://do/stop", expect.objectContaining({ method: "POST" }));
    expect(Preconditions.checkExists(deleteTrackerSpy, "deleteTracker spy")).toHaveBeenCalledWith("t1");
  });
});
