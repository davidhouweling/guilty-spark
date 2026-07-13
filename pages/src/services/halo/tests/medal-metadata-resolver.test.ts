import type { HaloInfiniteClient } from "halo-infinite-api";
import { describe, expect, it, vi } from "vitest";
import { aFakeMatchStatsWith } from "../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../medal-metadata-resolver";

function aMedalsMetadataFile(): Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>> {
  return {
    difficulties: ["normal", "heroic", "legendary", "mythic"],
    types: ["spree", "mode", "multikill", "proficiency", "skill", "style"],
    sprites: {
      small: { path: "small.png", columns: 16, size: 72 },
      medium: { path: "medium.png", columns: 16, size: 128 },
      "extra-large": { path: "large.png", columns: 16, size: 256 },
    },
    medals: [
      {
        name: { value: "Killing Spree", translations: {} },
        description: { value: "Kill 5 enemies without dying", translations: {} },
        spriteIndex: 1,
        sortingWeight: 100,
        difficultyIndex: 1,
        typeIndex: 0,
        personalScore: 10,
        nameId: 622331684,
      },
      {
        name: { value: "Double Kill", translations: {} },
        description: { value: "Kill 2 enemies in quick succession", translations: {} },
        spriteIndex: 2,
        sortingWeight: 50,
        difficultyIndex: 1,
        typeIndex: 2,
        personalScore: 10,
        nameId: 1169571763,
      },
    ],
  };
}

describe("HaloMedalMetadataResolver", () => {
  it("retries metadata loading after a transient failure", async () => {
    const getMedalsMetadataFile = vi.fn<Pick<HaloInfiniteClient, "getMedalsMetadataFile">["getMedalsMetadataFile"]>();
    getMedalsMetadataFile.mockRejectedValueOnce(new Error("temporary failure"));
    getMedalsMetadataFile.mockResolvedValueOnce(aMedalsMetadataFile());

    const haloClient = aFakeHaloClientWith({ getMedalsMetadataFile });
    const resolver = new HaloMedalMetadataResolver(haloClient);
    const stats = aFakeMatchStatsWith();

    const firstResult = await resolver.getMedalMetadataForMatches([stats]);
    const secondResult = await resolver.getMedalMetadataForMatches([stats]);

    expect(firstResult).toEqual({});
    expect(secondResult).toEqual({
      622331684: { name: "Killing Spree", sortingWeight: 100 },
      1169571763: { name: "Double Kill", sortingWeight: 50 },
    });
    expect(getMedalsMetadataFile).toHaveBeenCalledTimes(2);
  });
});
