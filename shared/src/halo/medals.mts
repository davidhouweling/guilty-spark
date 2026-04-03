export interface MedalEntry {
  name: string;
  count: number;
  sortingWeight: number;
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
