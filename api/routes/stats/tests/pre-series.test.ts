import { describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import { aFakeLivePreSeriesResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/pre-series.fake";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import { aFakeLiveTrackerDOWith } from "../../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import type { FakeLiveTrackerDO } from "../../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import { statsRoutesRegisterHandler } from "../stats";

function createRoute(
  data: LivePreSeriesResponse = aFakeLivePreSeriesResponseWith(),
  shouldThrowError = false,
): {
  services: Services;
  fetchSpy: MockInstance<FakeLiveTrackerDO["fetch"]>;
  idSpy: MockInstance<Env["LIVE_TRACKER_DO"]["idFromName"]>;
  fetch: (guild?: string, queue?: string) => Promise<Response>;
} {
  const stub = aFakeLiveTrackerDOWith({ preSeriesResponse: data, shouldThrowError });
  const env = aFakeEnvWith({ LIVE_TRACKER_DO: aFakeDurableObjectNamespaceWith(stub) });
  const services = installFakeServicesWith({ env });
  const router = createApiRouter();
  statsRoutesRegisterHandler(router, () => services);
  const fetchSpy = vi.spyOn(stub, "fetch");
  const idSpy = vi.spyOn(env.LIVE_TRACKER_DO, "idFromName");
  return {
    services,
    fetchSpy,
    idSpy,
    fetch: async (guild = "123456789", queue = "42"): Promise<Response> =>
      router.fetch(new Request(`https://example.com/api/stats/discord/${guild}/${queue}/pre-series`), env),
  };
}

describe("public live pre-series route", () => {
  it("returns captured data signed out with one scoped DO request and no archive lookup", async () => {
    const data = aFakeLivePreSeriesResponseWith();
    const route = createRoute(data);
    const archiveSpy = vi.spyOn(route.services.discordService, "getSeriesStats");
    const response = await route.fetch();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual(data);
    expect(route.fetchSpy).toHaveBeenCalledExactlyOnceWith(new Request("https://live-tracker/pre-series"));
    expect(route.idSpy).toHaveBeenCalledExactlyOnceWith("123456789:42");
    expect(archiveSpy).not.toHaveBeenCalled();
  });

  it("returns not-found without an empty success when no active roster remains", async () => {
    const response = await createRoute({ status: "not-found" }).fetch();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual({ status: "not-found" });
  });

  it.each([
    ["guild", "42"],
    ["123", "0"],
    ["123", "-1"],
    ["123", "42abc"],
    ["123", "9007199254740992"],
  ])("rejects invalid params %s/%s before accessing a tracker", async (guild, queue) => {
    const route = createRoute();
    const response = await route.fetch(guild, queue);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(route.fetchSpy).not.toHaveBeenCalled();
    expect(route.idSpy).not.toHaveBeenCalled();
  });

  it("logs transport failures instead of reporting missing captured data", async () => {
    const route = createRoute(aFakeLivePreSeriesResponseWith(), true);
    const errorSpy = vi.spyOn(route.services.logService, "error");
    const response = await route.fetch();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("logs inconsistent backend responses rather than treating them as absent", async () => {
    const route = createRoute();
    route.fetchSpy.mockResolvedValue(livePreSeriesContract.toResponse({ status: "not-found" }, { status: 500 }));
    const errorSpy = vi.spyOn(route.services.logService, "error");
    const response = await route.fetch();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
