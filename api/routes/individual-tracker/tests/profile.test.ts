import type { AutoRouterType } from "itty-router";
import { AutoRouter } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerProfileResponse } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeIndividualTrackerProfilesRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { IdentityNotOwnedError, ProfileNotFoundError } from "../../../services/individual-tracker/errors";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/individual-tracker/profile", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/individual-tracker/profile", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = AutoRouter();
  });

  it("returns 401 when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/profile", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(401);
  });

  it("returns the (get-or-created) profile mapped to the contract shape", async () => {
    const row = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", ActiveIdentityId: "id-1", Name: "default" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "getOrCreateProfile").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/profile", {
      method: "GET",
      headers: { Origin: env.PAGES_URL },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    const body = await res.json<TrackerProfileResponse>();
    expect(body).toEqual({ profile: { profileId: "p1", activeIdentityId: "id-1", name: "default" } });
  });

  it("updates a profile and returns 200", async () => {
    const row = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", ActiveIdentityId: "id-2", Name: "New" });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "updateProfile").mockResolvedValue(row);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      jsonRequest("PATCH", { profileId: "p1", name: "New", activeIdentityId: "id-2" }),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<TrackerProfileResponse>();
    expect(body).toEqual({ profile: { profileId: "p1", activeIdentityId: "id-2", name: "New" } });
  });

  it("returns 404 when updating a profile that is not found or not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "updateProfile").mockRejectedValue(new ProfileNotFoundError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(jsonRequest("PATCH", { profileId: "p1" }), env)) as Response;

    expect(res.status).toBe(404);
  });

  it("returns 400 on update when the active identity is not owned", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.individualTrackerService, "updateProfile").mockRejectedValue(new IdentityNotOwnedError());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      jsonRequest("PATCH", { profileId: "p1", activeIdentityId: "not-mine" }),
      env,
    )) as Response;

    expect(res.status).toBe(400);
  });

  it("returns 400 when the update body is missing the profileId", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(jsonRequest("PATCH", {}), env)) as Response;

    expect(res.status).toBe(400);
  });
});
