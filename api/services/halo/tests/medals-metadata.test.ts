import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { HaloService } from "../halo";
import { aFakeHaloServiceWith } from "../fakes/halo.fake";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake";
import { getMedalsMetadata } from "../fakes/data";
import { TimeInSeconds } from "../types";

describe("HaloService.getMedalsMetadata", () => {
  let haloService: HaloService;
  let getMedalsMetadataFileSpy: MockInstance<HaloInfiniteClient["getMedalsMetadataFile"]>;

  beforeEach(() => {
    const infiniteClient = aFakeHaloInfiniteClient();
    getMedalsMetadataFileSpy = vi.spyOn(infiniteClient, "getMedalsMetadataFile");
    haloService = aFakeHaloServiceWith({ infiniteClient });
  });

  it("shares cached upstream metadata with getMedal and preserves edge cache options", async () => {
    const [first, second, medal] = await Promise.all([
      haloService.getMedalsMetadata(),
      haloService.getMedalsMetadata(),
      haloService.getMedal(3334154676),
    ]);
    expect(first).toEqual(getMedalsMetadata());
    expect(second).toBe(first);
    expect(medal?.name).toBeDefined();
    expect(getMedalsMetadataFileSpy).toHaveBeenCalledExactlyOnceWith({
      cf: {
        cacheTtlByStatus: { "200-299": TimeInSeconds["1_WEEK"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 },
      },
    });
    expect(await haloService.getMedal(0)).toBeUndefined();
  });

  it("propagates upstream failures through both metadata and medal callers", async () => {
    const error = new Error("metadata failed");
    getMedalsMetadataFileSpy.mockRejectedValue(error);
    await expect(haloService.getMedalsMetadata()).rejects.toBe(error);
    await expect(haloService.getMedal(3334154676)).rejects.toBe(error);
    expect(getMedalsMetadataFileSpy).toHaveBeenCalledTimes(1);
  });
});
