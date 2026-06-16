import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { KillMatrixClassification, KillMatrixPlayer, KillMatrixViewRow } from "./types";

interface KillMatrixFormatterPlayerLookup {
  readonly gamertag: string;
  readonly teamId: number | null;
}

export interface KillMatrixFormatterOptions {
  readonly analytics: MatchAnalytics;
  readonly playersByXuid: ReadonlyMap<string, KillMatrixFormatterPlayerLookup>;
}

export class KillMatrixFormatter {
  public present({ analytics, playersByXuid }: KillMatrixFormatterOptions): KillMatrixViewRow[] {
    const rows: KillMatrixViewRow[] = [];

    for (const [key, value] of Object.entries(analytics.killMatrix)) {
      const { killerXuid, victimXuid } = this.parsePairKey(key);
      const killer = this.toPlayer(killerXuid, playersByXuid);
      const victim = this.toPlayer(victimXuid, playersByXuid);

      rows.push({
        key,
        killer,
        victim,
        count: value.count,
        headshotKills: value.headshotKills,
        perfects: value.perfects,
        classification: this.classify(killer, victim),
      });
    }

    return rows.sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.key.localeCompare(right.key);
    });
  }

  private createFallbackPlayer(xuid: string): KillMatrixPlayer {
    return {
      xuid,
      gamertag: xuid,
      teamId: null,
    };
  }

  private toPlayer(
    xuid: string,
    playersByXuid: ReadonlyMap<string, KillMatrixFormatterPlayerLookup>,
  ): KillMatrixPlayer {
    const entry = playersByXuid.get(xuid);
    if (entry == null) {
      return this.createFallbackPlayer(xuid);
    }

    return {
      xuid,
      gamertag: entry.gamertag,
      teamId: entry.teamId,
    };
  }

  private classify(killer: KillMatrixPlayer, victim: KillMatrixPlayer): KillMatrixClassification {
    if (killer.xuid === victim.xuid) {
      return "suicide";
    }

    if (killer.teamId != null && victim.teamId != null && killer.teamId === victim.teamId) {
      return "betrayal";
    }

    return "enemy-kill";
  }

  private parsePairKey(key: string): { killerXuid: string; victimXuid: string } {
    const [killerXuid, victimXuid] = key.split(":");
    return { killerXuid, victimXuid };
  }

  public static aggregate(rows: readonly KillMatrixViewRow[]): KillMatrixViewRow[] {
    const merged = new Map<string, KillMatrixViewRow>();

    for (const row of rows) {
      const existing = merged.get(row.key);
      if (existing == null) {
        merged.set(row.key, { ...row });
      } else {
        merged.set(row.key, {
          ...existing,
          count: existing.count + row.count,
          headshotKills: existing.headshotKills + row.headshotKills,
          perfects: existing.perfects + row.perfects,
        });
      }
    }

    return [...merged.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.key.localeCompare(right.key);
    });
  }
}
