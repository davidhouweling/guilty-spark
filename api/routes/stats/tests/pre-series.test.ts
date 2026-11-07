import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import { aFakeLivePreSeriesResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/pre-series.fake";
import { createApiRouter } from "../../../base/router";
import type { ApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import { aFakeLiveTrackerDOWith } from "../../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import type { FakeLiveTrackerDO } from "../../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import { statsRoutesRegisterHandler } from "../stats";

describe("public live pre-series route", () => {
  let services: Services;
  let router: ApiRouter;
  let stub: FakeLiveTrackerDO;
  let env: Env;
  let fetchSpy: MockInstance<FakeLiveTrackerDO["fetch"]>;
  let idFromNameSpy: MockInstance<Env["LIVE_TRACKER_DO"]["idFromName"]>;
  let getSeriesStatsSpy: MockInstance<Services["discordService"]["getSeriesStats"]>;
  let logErrorSpy: MockInstance<Services["logService"]["error"]>;

  beforeEach(() => {
    stub = aFakeLiveTrackerDOWith();
    env = aFakeEnvWith({ LIVE_TRACKER_DO: aFakeDurableObjectNamespaceWith(stub) });
    services = installFakeServicesWith({ env });
    router = createApiRouter();
    statsRoutesRegisterHandler(router, () => services);
    fetchSpy = vi.spyOn(stub, "fetch");
    idFromNameSpy = vi.spyOn(env.LIVE_TRACKER_DO, "idFromName");
    getSeriesStatsSpy = vi.spyOn(services.discordService, "getSeriesStats");
    logErrorSpy = vi.spyOn(services.logService, "error");
  });

  it("returns captured data signed out with one scoped DO request and no archive lookup", async () => {
    const data = aFakeLivePreSeriesResponseWith();
    fetchSpy.mockResolvedValue(livePreSeriesContract.toResponse(data, { noStore: true }));
    const response = await router.fetch(
      new Request("https://example.com/api/stats/discord/123456789/42/pre-series"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual(data);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(new Request("https://live-tracker/pre-series"));
    expect(idFromNameSpy).toHaveBeenCalledExactlyOnceWith("123456789:42");
    expect(getSeriesStatsSpy).not.toHaveBeenCalled();
  });

  it("returns not-found without an empty success when no active roster remains", async () => {
    fetchSpy.mockResolvedValue(livePreSeriesContract.toResponse({ status: "not-found" }, { status: 404 }));
    const response = await router.fetch(
      new Request("https://example.com/api/stats/discord/123456789/42/pre-series"),
      env,
    );
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
    const response = await router.fetch(
      new Request(`https://example.com/api/stats/discord/${guild}/${queue}/pre-series`),
      env,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idFromNameSpy).not.toHaveBeenCalled();
  });

  it("logs transport failures instead of reporting missing captured data", async () => {
    fetchSpy.mockRejectedValue(new Error("Fake DO error"));
    const response = await router.fetch(
      new Request("https://example.com/api/stats/discord/123456789/42/pre-series"),
      env,
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(logErrorSpy).toHaveBeenCalledOnce();
  });

  it("logs inconsistent backend responses rather than treating them as absent", async () => {
    fetchSpy.mockResolvedValue(livePreSeriesContract.toResponse({ status: "not-found" }, { status: 500 }));
    const response = await router.fetch(
      new Request("https://example.com/api/stats/discord/123456789/42/pre-series"),
      env,
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(logErrorSpy).toHaveBeenCalledOnce();
  });
});
