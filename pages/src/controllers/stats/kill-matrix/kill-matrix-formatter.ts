import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { KillMatrixClassification, KillMatrixPivotData, KillMatrixPlayer, KillMatrixViewRow } from "./types";

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

  public static pivot(rows: readonly KillMatrixViewRow[]): KillMatrixPivotData {
    if (rows.length === 0) {
      return { tableRows: [], victimGamertags: [] };
    }

    const killersMap = new Map<string, string>();
    const victimsMap = new Map<string, string>();
    const killCounts = new Map<string, Map<string, number>>();

    for (const row of rows) {
      killersMap.set(row.killer.xuid, row.killer.gamertag);
      victimsMap.set(row.victim.xuid, row.victim.gamertag);

      if (!killCounts.has(row.killer.xuid)) {
        killCounts.set(row.killer.xuid, new Map());
      }
      const victimCounts = Preconditions.checkExists(killCounts.get(row.killer.xuid));
      victimCounts.set(row.victim.xuid, row.count);
    }

    const sortedKillers = Array.from(killersMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const sortedVictims = Array.from(victimsMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    const tableRows = sortedKillers.map(([killerId, killerGamertag]) => {
      const row: { killerId: string; killerGamertag: string; [key: string]: string | number } = {
        killerId,
        killerGamertag,
      };

      const victimCounts = killCounts.get(killerId) ?? new Map();
      for (const [victimId, victimGamertag] of sortedVictims) {
        row[victimGamertag] = victimCounts.get(victimId) ?? 0;
      }

      return row;
    });

    const victimGamertags = sortedVictims.map(([, gamertag]) => gamertag);

    return { tableRows, victimGamertags };
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
