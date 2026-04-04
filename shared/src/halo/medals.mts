import type { Stats } from "halo-infinite-api";

export interface MedalEntry {
  name: string;
  count: number;
  sortingWeight: number;
}

export type MedalMetadata = Record<number, { name: string; sortingWeight: number }>;

export function extractMedals(coreStats: Stats["CoreStats"], medalMetadata?: MedalMetadata): MedalEntry[] {
  return coreStats.Medals.map((medal) => {
    const metadata = medalMetadata?.[medal.NameId];
    return {
      name: metadata?.name ?? medal.NameId.toString(),
      count: medal.Count,
      sortingWeight: metadata?.sortingWeight ?? medal.TotalPersonalScoreAwarded,
    };
  }).sort((a, b) => b.sortingWeight - a.sortingWeight);
}

export function aggregateTeamMedals(players: { medals: MedalEntry[] }[]): MedalEntry[] {
  const medalMap = new Map<string, MedalEntry>();
  for (const player of players) {
    for (const medal of player.medals) {
      const existing = medalMap.get(medal.name);
      if (existing) {
        existing.count += medal.count;
      } else {
        medalMap.set(medal.name, { ...medal });
      }
    }
  }
  return Array.from(medalMap.values()).sort((a, b) => b.sortingWeight - a.sortingWeight);
}
