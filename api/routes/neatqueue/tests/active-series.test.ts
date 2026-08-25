import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveSeriesListResponse } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { SeriesStartedPayload } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/nudge";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeAuthSessionWith } from "../../../services/auth/fakes/data";
import { neatQueueRoutesRegisterHandler } from "../active-series";

function aSeriesContextWith(overrides: Partial<SeriesStartedPayload> = {}): SeriesStartedPayload {
  return {
    type: "started",
    title: "Test Server",
    subtitle: "Queue #5",
    guildIconUrl: null,
    startedAt: "2026-08-01T10:00:00.000Z",
    teams: [],
    ...overrides,
  };
}

describe("GET /api/neatqueue/active-series", () => {
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
    neatQueueRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/neatqueue/active-series", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(401);
  });

  it("returns the active series list, redacting player Discord identifiers", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.neatQueueService, "listActiveSeries").mockResolvedValue([
        {
          guildId: "guild-1",
          queueNumber: 5,
          seriesContext: aSeriesContextWith({
            teams: [
              {
                id: 0,
                name: "Team A",
                players: [
                  {
                    discordId: "discord-1",
                    discordName: "Chief#1234",
                    gamertag: "Chief",
                    xboxId: "xuid-1",
                  },
                ],
              },
            ],
          }),
        },
      ]);
      return services;
    });
    neatQueueRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/neatqueue/active-series", {
      method: "GET",
      headers: { Origin: env.PAGES_URL },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<ActiveSeriesListResponse>();
    expect(body).toEqual({
      series: [
        {
          guildId: "guild-1",
          queueNumber: 5,
          title: "Test Server",
          subtitle: "Queue #5",
          guildIconUrl: null,
          startedAt: "2026-08-01T10:00:00.000Z",
          teams: [{ id: 0, name: "Team A", players: [{ gamertag: "Chief", xboxId: "xuid-1" }] }],
        },
      ],
    });
  });

  it("returns 500 when the service throws", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue(aFakeAuthSessionWith());
      vi.spyOn(services.neatQueueService, "listActiveSeries").mockRejectedValue(new Error("boom"));
      return services;
    });
    neatQueueRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/api/neatqueue/active-series", {
      method: "GET",
      headers: { Origin: env.PAGES_URL },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(500);
  });
});
