import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { SeriesStartedPayload } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/nudge";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { NeatQueueService } from "../neatqueue";
import { aFakeNeatQueueServiceWith } from "../fakes/neatqueue.fake";
import { aFakeNeatQueueStateWith, aFakePlayerAssociationDataWith } from "../fakes/data";
import type { NeatQueueState } from "../types";

function aSeriesContextWith(overrides: Partial<SeriesStartedPayload> = {}): SeriesStartedPayload {
  return {
    type: "started",
    title: "Test Server",
    subtitle: "Queue #5",
    guildIconUrl: null,
    startedAt: "2026-08-01T10:00:00.000Z",
    searchStartTime: "2026-08-01T09:30:00.000Z",
    teams: [],
    ...overrides,
  };
}

describe("NeatQueueService.findActiveSeriesForPlayer()", () => {
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

  it("returns null when no queue states exist", async () => {
    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(listSpy).toHaveBeenCalledWith({ prefix: "neatqueue:state:" });
    expect(result).toBeNull();
  });

  it("returns null when queue states have no series context", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5"]));
    getSpy.mockResolvedValue(aFakeNeatQueueStateWith());

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(result).toBeNull();
  });

  it("finds the active series when the player xuid is in the association data", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5"]));
    const state: NeatQueueState = aFakeNeatQueueStateWith({
      seriesContext: aSeriesContextWith(),
      playersAssociationData: {
        "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: "xuid-1" }),
      },
    });
    getSpy.mockResolvedValue(state);

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(result).toEqual({
      guildId: "guild-1",
      queueNumber: 5,
      seriesContext: state.seriesContext,
    });
  });

  it("matches by gamertag case-insensitively when xuid does not match", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5"]));
    getSpy.mockResolvedValue(
      aFakeNeatQueueStateWith({
        seriesContext: aSeriesContextWith(),
        playersAssociationData: {
          "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: null, gamertag: "CHIEF" }),
        },
      }),
    );

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "chief");

    expect(result?.guildId).toBe("guild-1");
  });

  it("returns null when the player is not in any active series", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5"]));
    getSpy.mockResolvedValue(
      aFakeNeatQueueStateWith({
        seriesContext: aSeriesContextWith(),
        playersAssociationData: {
          "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: "other-xuid" }),
        },
      }),
    );

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(result).toBeNull();
  });

  it("follows KV list pagination across multiple pages", async () => {
    const association = {
      "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: "xuid-1" }),
    };
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
        return Promise.resolve(
          aFakeNeatQueueStateWith({ seriesContext: aSeriesContextWith(), playersAssociationData: association }),
        );
      }
      return Promise.resolve(aFakeNeatQueueStateWith());
    });

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(listSpy).toHaveBeenCalledWith({ prefix: "neatqueue:state:", cursor: "page-2" });
    expect(result?.guildId).toBe("guild-2");
  });

  it("ignores queue state keys with a non-numeric queue number", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:not-a-number"]));

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(result).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("picks the most recently started series when the player is in multiple", async () => {
    listSpy.mockResolvedValue(listResultWith(["neatqueue:state:guild-1:5", "neatqueue:state:guild-2:9"]));
    const association = {
      "discord-1": aFakePlayerAssociationDataWith({ discordId: "discord-1", xboxId: "xuid-1" }),
    };
    getSpy.mockImplementation(async (key: string) => {
      if (key === "neatqueue:state:guild-1:5") {
        return Promise.resolve(
          aFakeNeatQueueStateWith({
            seriesContext: aSeriesContextWith({ startedAt: "2026-08-01T08:00:00.000Z" }),
            playersAssociationData: association,
          }),
        );
      }
      return Promise.resolve(
        aFakeNeatQueueStateWith({
          seriesContext: aSeriesContextWith({ startedAt: "2026-08-01T11:00:00.000Z" }),
          playersAssociationData: association,
        }),
      );
    });

    const result = await neatQueueService.findActiveSeriesForPlayer("xuid-1", "Chief");

    expect(result?.guildId).toBe("guild-2");
    expect(result?.queueNumber).toBe(9);
  });
});
