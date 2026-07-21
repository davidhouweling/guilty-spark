import type { KillMatrixWeaponUsage, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type {
  H2HWeaponRow,
  KillMatrixClassification,
  KillMatrixColumnHeader,
  KillMatrixCrossTeamData,
  KillMatrixCrossTeamFootnote,
  KillMatrixPivotData,
  KillMatrixPlayer,
  KillMatrixViewRow,
} from "./types";

interface CrossTeamPair {
  readonly crossTeamData: KillMatrixCrossTeamData;
  readonly swappedCrossTeamData: KillMatrixCrossTeamData;
}

export const GAMES_SUFFIX_RE = /\s+\(\d+\/\d+ games\)$/;

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
        weapons: [...value.weapons].sort((a, b) => b.count - a.count),
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

  public static pivot(
    rows: readonly KillMatrixViewRow[],
    orderedPlayers?: readonly KillMatrixPlayer[],
  ): KillMatrixPivotData {
    if (rows.length === 0) {
      return { tableRows: [], columnHeaders: [] };
    }

    const killersMap = new Map<string, KillMatrixPlayer>();
    const victimsMap = new Map<string, KillMatrixPlayer>();
    const killCounts = new Map<string, Map<string, number>>();
    const perfectCounts = new Map<string, Map<string, number>>();
    const weaponLists = new Map<string, Map<string, readonly KillMatrixWeaponUsage[]>>();

    for (const row of rows) {
      killersMap.set(row.killer.xuid, row.killer);
      victimsMap.set(row.victim.xuid, row.victim);

      if (!killCounts.has(row.killer.xuid)) {
        killCounts.set(row.killer.xuid, new Map());
        perfectCounts.set(row.killer.xuid, new Map());
        weaponLists.set(row.killer.xuid, new Map());
      }
      const victimCounts = Preconditions.checkExists(killCounts.get(row.killer.xuid));
      victimCounts.set(row.victim.xuid, row.count);
      Preconditions.checkExists(perfectCounts.get(row.killer.xuid)).set(row.victim.xuid, row.perfects);
      Preconditions.checkExists(weaponLists.get(row.killer.xuid)).set(row.victim.xuid, row.weapons);
    }

    const byGamertag = (a: KillMatrixPlayer, b: KillMatrixPlayer): number => a.gamertag.localeCompare(b.gamertag);

    let sortedKillers: KillMatrixPlayer[];
    let sortedVictims: KillMatrixPlayer[];
    if (orderedPlayers != null) {
      const orderedXuids = new Set(orderedPlayers.map((p) => p.xuid));
      sortedKillers = [
        ...orderedPlayers.filter((p) => killersMap.has(p.xuid)),
        ...Array.from(killersMap.values())
          .filter((p) => !orderedXuids.has(p.xuid))
          .sort(byGamertag),
      ];
      sortedVictims = [
        ...orderedPlayers.filter((p) => victimsMap.has(p.xuid)),
        ...Array.from(victimsMap.values())
          .filter((p) => !orderedXuids.has(p.xuid))
          .sort(byGamertag),
      ];
    } else {
      sortedKillers = Array.from(killersMap.values()).sort(byGamertag);
      sortedVictims = Array.from(victimsMap.values()).sort(byGamertag);
    }

    const tableRows = sortedKillers.map((killer) => {
      const victimCounts = Preconditions.checkExists(killCounts.get(killer.xuid));
      const victimPerfects = Preconditions.checkExists(perfectCounts.get(killer.xuid));
      const victimWeapons = Preconditions.checkExists(weaponLists.get(killer.xuid));
      const kills = new Map<string, number>();
      const perfects = new Map<string, number>();
      const weapons = new Map<string, readonly KillMatrixWeaponUsage[]>();
      for (const victim of sortedVictims) {
        kills.set(victim.gamertag, victimCounts.get(victim.xuid) ?? 0);
        perfects.set(victim.gamertag, victimPerfects.get(victim.xuid) ?? 0);
        weapons.set(victim.gamertag, victimWeapons.get(victim.xuid) ?? []);
      }
      return {
        killerId: killer.xuid,
        killerGamertag: killer.gamertag,
        killerTeamId: killer.teamId,
        kills,
        perfects,
        weapons,
      };
    });

    const columnHeaders: KillMatrixColumnHeader[] = sortedVictims.map((p) => ({
      gamertag: p.gamertag,
      teamId: p.teamId,
      xuid: p.xuid,
    }));

    return { tableRows, columnHeaders };
  }

  public static transpose(
    rows: readonly KillMatrixViewRow[],
    orderedPlayers?: readonly KillMatrixPlayer[],
  ): KillMatrixPivotData {
    return KillMatrixFormatter.pivot(
      rows.map((row) => ({ ...row, killer: row.victim, victim: row.killer })),
      orderedPlayers,
    );
  }

  public static pivotCrossTeam(
    rows: readonly KillMatrixViewRow[],
    rowTeamPlayers: readonly KillMatrixPlayer[],
    colTeamPlayers: readonly KillMatrixPlayer[],
  ): KillMatrixCrossTeamData {
    const killCounts = new Map<string, Map<string, number>>();
    const perfectCounts = new Map<string, Map<string, number>>();
    const weaponLists = new Map<string, Map<string, readonly KillMatrixWeaponUsage[]>>();
    let betrayals = 0;
    let suicides = 0;

    for (const row of rows) {
      if (row.classification === "betrayal") {
        betrayals += row.count;
        continue;
      }
      if (row.classification === "suicide") {
        suicides += row.count;
        continue;
      }
      if (!killCounts.has(row.killer.xuid)) {
        killCounts.set(row.killer.xuid, new Map());
        perfectCounts.set(row.killer.xuid, new Map());
        weaponLists.set(row.killer.xuid, new Map());
      }
      Preconditions.checkExists(killCounts.get(row.killer.xuid)).set(row.victim.xuid, row.count);
      Preconditions.checkExists(perfectCounts.get(row.killer.xuid)).set(row.victim.xuid, row.perfects);
      Preconditions.checkExists(weaponLists.get(row.killer.xuid)).set(row.victim.xuid, row.weapons);
    }

    const tableRows = rowTeamPlayers.map((rowPlayer) => {
      const cells = new Map(
        colTeamPlayers.map((colPlayer) => [
          colPlayer.gamertag,
          {
            kills: killCounts.get(rowPlayer.xuid)?.get(colPlayer.xuid) ?? 0,
            deaths: killCounts.get(colPlayer.xuid)?.get(rowPlayer.xuid) ?? 0,
            killPerfects: perfectCounts.get(rowPlayer.xuid)?.get(colPlayer.xuid) ?? 0,
            deathPerfects: perfectCounts.get(colPlayer.xuid)?.get(rowPlayer.xuid) ?? 0,
            killWeapons: weaponLists.get(rowPlayer.xuid)?.get(colPlayer.xuid) ?? [],
            deathWeapons: weaponLists.get(colPlayer.xuid)?.get(rowPlayer.xuid) ?? [],
          },
        ]),
      );
      return {
        playerId: rowPlayer.xuid,
        playerGamertag: rowPlayer.gamertag,
        playerTeamId: rowPlayer.teamId,
        cells,
      };
    });

    const columnHeaders: KillMatrixColumnHeader[] = colTeamPlayers.map((p) => ({
      gamertag: p.gamertag,
      teamId: p.teamId,
      xuid: p.xuid,
    }));

    const footnote: KillMatrixCrossTeamFootnote | null = betrayals > 0 || suicides > 0 ? { betrayals, suicides } : null;

    return { tableRows, columnHeaders, footnote };
  }

  public static buildCrossTeam(
    rows: readonly KillMatrixViewRow[],
    orderedPlayers: readonly KillMatrixPlayer[],
  ): CrossTeamPair | null {
    if (orderedPlayers.some((p) => p.teamId == null)) {
      return null;
    }
    const teamIds = [...new Set(orderedPlayers.map((p) => p.teamId).filter((id): id is number => id != null))];
    if (teamIds.length !== 2) {
      return null;
    }
    const [firstTeamId, secondTeamId] = teamIds;
    const firstTeamPlayers = orderedPlayers.filter((p) => p.teamId === firstTeamId);
    const secondTeamPlayers = orderedPlayers.filter((p) => p.teamId === secondTeamId);
    return {
      crossTeamData: KillMatrixFormatter.pivotCrossTeam(rows, firstTeamPlayers, secondTeamPlayers),
      swappedCrossTeamData: KillMatrixFormatter.pivotCrossTeam(rows, secondTeamPlayers, firstTeamPlayers),
    };
  }

  public static buildH2HWeaponRows(
    aWeapons: readonly KillMatrixWeaponUsage[],
    bWeapons: readonly KillMatrixWeaponUsage[],
  ): H2HWeaponRow[] {
    const byId = new Map<string, H2HWeaponRow>();
    for (const w of aWeapons) {
      byId.set(w.weaponId, { weaponId: w.weaponId, name: w.name, aCount: w.count, bCount: 0 });
    }
    for (const w of bWeapons) {
      const existing = byId.get(w.weaponId);
      byId.set(
        w.weaponId,
        existing != null
          ? { ...existing, bCount: w.count }
          : { weaponId: w.weaponId, name: w.name, aCount: 0, bCount: w.count },
      );
    }
    return [...byId.values()].sort((x, y) => y.aCount + y.bCount - (x.aCount + x.bCount));
  }

  private static mergeWeapons(
    a: readonly KillMatrixWeaponUsage[],
    b: readonly KillMatrixWeaponUsage[],
  ): KillMatrixWeaponUsage[] {
    const counts = new Map<string, KillMatrixWeaponUsage>();
    for (const w of [...a, ...b]) {
      const existing = counts.get(w.weaponId);
      counts.set(w.weaponId, existing != null ? { ...existing, count: existing.count + w.count } : { ...w });
    }
    return [...counts.values()].sort((x, y) => y.count - x.count);
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
          weapons: KillMatrixFormatter.mergeWeapons(existing.weapons, row.weapons),
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
