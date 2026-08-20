import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchEsraResponse } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { individualTrackerRoutesRegisterHandler } from "../individual-tracker";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";

describe("/api/individual-tracker/search/:gamertag/esra", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 401 when not authenticated", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(null);
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/search/Master%20Chief/esra", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(401);
  });

  it("returns the resolved ESRA for the gamertag", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.haloService, "getUserByGamertag").mockResolvedValue({
        xuid: "2533274800000001",
        gamertag: "Master Chief",
      });
      vi.spyOn(services.haloService, "getPlayerEsra").mockResolvedValue({
        esra: 1234.7,
        lastRankedGamePlayed: "2024-11-26T10:00:00.000Z",
      });
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/search/Master%20Chief/esra", {
      method: "GET",
      headers: { Origin: env.PAGES_URL },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<SearchEsraResponse>();
    expect(body).toEqual({ esra: { esra: 1234.7, lastRankedGamePlayed: "2024-11-26T10:00:00.000Z" } });
  });

  it("returns null esra when the gamertag cannot be resolved", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.haloService, "getUserByGamertag").mockRejectedValue(new Error("Not found"));
      return services;
    });
    individualTrackerRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/individual-tracker/search/UnknownSpartan/esra", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<SearchEsraResponse>();
    expect(body).toEqual({ esra: { esra: null, lastRankedGamePlayed: null } });
  });
});
