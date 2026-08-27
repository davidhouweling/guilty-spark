import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { NeatQueueService } from "../neatqueue";
import { aFakeNeatQueueServiceWith } from "../fakes/neatqueue.fake";
import { aFakeNeatQueueStateWith, aFakePlayerAssociationDataWith, aFakeSeriesStartedPayloadWith } from "../fakes/data";
import type { NeatQueueState } from "../types";

describe("NeatQueueService.listActiveSeries()", () => {
  let env: Env;
  let neatQueueService: NeatQueueService;
  let listSpy: MockInstance<typeof env.APP_DATA.list>;
  let getSpy: MockInstance<(key: string, opts: { type: "json" }) => Promise<NeatQueueState | null>>;

  const listResultWith = (names: string[]): Awaited<ReturnType<typeof env.APP_DATA.list>> => ({
    list_complete: true as const,
    keys: names.map((name) => ({ name })),
    cacheStatus: null,
  });

  beforeEach(() => {
    env = aFakeEnvWith();
    neatQueueService = aFakeNeatQueueServiceWith({ env });
    listSpy = vi.spyOn(env.APP_DATA, "list").mockResolvedValue(listResultWith([]));
    getSpy = vi.spyOn(env.APP_DATA, "get");
  });

  it("returns an empty array when no queue states exist", async () => {
    const result = await neatQueueService.listActiveSeries();

    expect(listSpy).toHaveBeenCalledWith({ prefix: "neatqueue:state:" });
    expect(result).toEqual([]);
  });

  it("excludes queue states with no series context", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5"]));
    getSpy.mockResolvedValue(aFakeNeatQueueStateWith());

    const result = await neatQueueService.listActiveSeries();

    expect(result).toEqual([]);
  });

  it("returns every active series regardless of whether a specific player is in it", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5", "neatqueue:state:guild-2:9"]));
    const seriesOne = aFakeSeriesStartedPayloadWith({ title: "Guild One" });
    const seriesTwo = aFakeSeriesStartedPayloadWith({ title: "Guild Two", startedAt: "2026-08-01T11:00:00.000Z" });
    getSpy.mockImplementation(async (key: string) => {
      if (key === "neatqueue:state:guild-1:5") {
        return Promise.resolve(
          aFakeNeatQueueStateWith({
            seriesContext: seriesOne,
            playersAssociationData: {
              "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: "unrelated-xuid" }),
            },
          }),
        );
      }
      return Promise.resolve(aFakeNeatQueueStateWith({ seriesContext: seriesTwo, playersAssociationData: {} }));
    });

    const result = await neatQueueService.listActiveSeries();

    expect(result).toEqual([
      { guildId: "guild-1", queueNumber: 5, seriesContext: seriesOne },
      { guildId: "guild-2", queueNumber: 9, seriesContext: seriesTwo },
    ]);
  });

  it("follows KV list pagination across multiple pages", async () => {
    listSpy.mockImplementation(async (options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<unknown>> => {
      if (options?.cursor === "page-2") {
        return Promise.resolve(listResultWith(["neatqueue:state:guild-2:9"]));
      }
      return Promise.resolve({
        list_complete: false,
        cursor: "page-2",
        keys: [{ name: "neatqueue:state:guild-1:5" }],
        cacheStatus: null,
      });
    });
    getSpy.mockImplementation(async (key: string) => {
      if (key === "neatqueue:state:guild-2:9") {
        return Promise.resolve(aFakeNeatQueueStateWith({ seriesContext: aFakeSeriesStartedPayloadWith() }));
      }
      return Promise.resolve(aFakeNeatQueueStateWith());
    });

    const result = await neatQueueService.listActiveSeries();

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(listSpy).toHaveBeenCalledWith({ prefix: "neatqueue:state:", cursor: "page-2" });
    expect(result).toHaveLength(1);
    expect(result[0]?.guildId).toBe("guild-2");
  });

  it("ignores queue state keys with a non-numeric queue number", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:not-a-number"]));

    const result = await neatQueueService.listActiveSeries();

    expect(result).toEqual([]);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
