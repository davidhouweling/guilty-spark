import type { HaloInfiniteClient } from "halo-infinite-api";

type MetadataFile = Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>>;

export function aFakeMedalMetadataWith(
  overrides: Partial<MetadataFile["medals"][number]> = {},
): MetadataFile["medals"][number] {
  return {
    name: { value: "Killing Spree", translations: { fr: "Folie meurtrière" } },
    description: { value: "Kill 5 enemies without dying.", translations: {} },
    spriteIndex: 17,
    sortingWeight: 100,
    difficultyIndex: 1,
    typeIndex: 0,
    personalScore: 20,
    nameId: 622331684,
    ...overrides,
  };
}
