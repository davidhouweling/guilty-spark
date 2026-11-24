import type { Medal } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";

export function projectMedals(
  source: readonly Medal[],
  mode: "ticker" | "panel",
): { medals: MedalEntry[]; hasUnknownRarity: boolean } {
  const medals: MedalEntry[] = [];
  let hasUnknownRarity = false;
  for (const medal of source) {
    const sortingWeight = medal.sortingWeight ?? medal.totalPersonalScoreAwarded;
    if (sortingWeight == null) {
      hasUnknownRarity = true;
      if (mode === "ticker") {
        continue;
      }
    }
    // Old responses have no rarity; zero is only a panel sort placeholder.
    medals.push({ name: medal.name ?? medal.id.toString(), count: medal.count, sortingWeight: sortingWeight ?? 0 });
  }
  medals.sort((left, right) => right.sortingWeight - left.sortingWeight);
  return { medals, hasUnknownRarity };
}
