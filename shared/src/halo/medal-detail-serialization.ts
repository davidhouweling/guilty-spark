import type { HaloInfiniteClient, Stats } from "halo-infinite-api";
import { medalSchema } from "../contracts/stats/detail-primitives";
import type { Medal } from "../contracts/stats/detail-primitives";

export function serializeMedalDetails(
  medals: Stats["CoreStats"]["Medals"],
  metadataById: Record<
    number,
    Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>>["medals"][number] | null | undefined
  >,
  difficulties: Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>>["difficulties"],
): Medal[] {
  return medals.map((medal) => {
    const metadata = metadataById[medal.NameId];
    if (metadata != null && metadata.nameId !== medal.NameId) {
      throw new Error(`Medal metadata identity does not match NameId ${String(medal.NameId)}`);
    }

    return medalSchema.parse({
      id: medal.NameId,
      count: medal.Count,
      name: metadata == null ? null : metadata.name.value,
      sortingWeight: metadata == null ? null : metadata.sortingWeight,
      difficultyIndex: metadata == null ? null : metadata.difficultyIndex,
      difficulty: metadata == null ? null : (difficulties[metadata.difficultyIndex] ?? null),
    });
  });
}
