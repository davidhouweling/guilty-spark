import { describe, expect, it } from "vitest";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../fakes/services";
import { createAnalyticsService } from "../analytics-service";

describe("createAnalyticsService", () => {
  it("returns killMatrix analytics for supported module", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    const service = createAnalyticsService(env, services.haloService, services.logService);

    const analytics = await service.getMatchAnalytics("match-123", ["killMatrix"]);

    expect(analytics.requestedModules).toEqual(["killMatrix"]);
    expect(analytics.killMatrix).toEqual({});
  });

  it("rejects when no supported modules are requested", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    const service = createAnalyticsService(env, services.haloService, services.logService);

    await expect(service.getMatchAnalytics("match-123", ["scoreProgression"])).rejects.toThrow(
      "No supported analytics modules requested",
    );
  });
});
