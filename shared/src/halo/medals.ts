import type { Stats } from "halo-infinite-api";

interface MedalSourceEntry {
  NameId: number;
}

interface MedalSourceMatch {
  Teams: {
    Stats: {
      CoreStats: {
        Medals: MedalSourceEntry[];
      };
    };
  }[];
  Players: {
    PlayerTeamStats: {
      Stats: {
        CoreStats: {
          Medals: MedalSourceEntry[];
        };
      };
    }[];
  }[];
}

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

export async function getMedalMetadataFromMatches(
  rawMatches: Record<string, MedalSourceMatch>,
  getMedal: (medalId: number) => Promise<{ name: string; sortingWeight: number } | undefined>,
): Promise<MedalMetadata> {
  const medalIds = new Set<number>();
  for (const match of Object.values(rawMatches)) {
    for (const team of match.Teams) {
      for (const medal of team.Stats.CoreStats.Medals) {
        medalIds.add(medal.NameId);
      }
    }

    for (const player of match.Players) {
      for (const teamStats of player.PlayerTeamStats) {
        for (const medal of teamStats.Stats.CoreStats.Medals) {
          medalIds.add(medal.NameId);
        }
      }
    }
  }

  const medalMetadata: MedalMetadata = {};
  for (const medalId of medalIds) {
    const medal = await getMedal(medalId);
    if (medal != null) {
      medalMetadata[medalId] = {
        name: medal.name,
        sortingWeight: medal.sortingWeight,
      };
    }
  }

  return medalMetadata;
}
