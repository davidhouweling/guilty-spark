import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { NeatQueueService } from "../neatqueue";
import { aFakeNeatQueueServiceWith } from "../fakes/neatqueue.fake";
import { aFakeNeatQueueStateWith, aFakeSeriesStartedPayloadWith } from "../fakes/data";
import type { NeatQueueState } from "../types";

describe("NeatQueueService.getActiveSeriesByQueue()", () => {
  let env: Env;
  let neatQueueService: NeatQueueService;
  let getSpy: MockInstance<(key: string, opts: { type: "json" }) => Promise<NeatQueueState | null>>;

  beforeEach(() => {
    env = aFakeEnvWith();
    neatQueueService = aFakeNeatQueueServiceWith({ env });
    getSpy = vi.spyOn(env.APP_DATA, "get");
  });

  it("returns the active series for the given guild/queue without a KV scan", async () => {
    getSpy.mockResolvedValue(aFakeNeatQueueStateWith({ seriesContext: aFakeSeriesStartedPayloadWith() }));

    const result = await neatQueueService.getActiveSeriesByQueue("guild-1", 5);

    expect(getSpy).toHaveBeenCalledWith("neatqueue:state:guild-1:5", { type: "json" });
    expect(result).toEqual({ guildId: "guild-1", queueNumber: 5, seriesContext: aFakeSeriesStartedPayloadWith() });
  });

  it("returns null when the queue has no series context", async () => {
    getSpy.mockResolvedValue(aFakeNeatQueueStateWith());

    const result = await neatQueueService.getActiveSeriesByQueue("guild-1", 5);

    expect(result).toBeNull();
  });

  it("returns null when the queue state does not exist", async () => {
    getSpy.mockResolvedValue(null);

    const result = await neatQueueService.getActiveSeriesByQueue("guild-1", 5);

    expect(result).toBeNull();
  });
});
