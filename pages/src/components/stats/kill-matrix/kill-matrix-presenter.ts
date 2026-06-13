import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { KillMatrixClassification, KillMatrixPlayer, KillMatrixViewRow } from "./types";

interface KillMatrixPresenterPlayerLookup {
  readonly gamertag: string;
  readonly teamId: number | null;
}

export interface KillMatrixPresenterOptions {
  readonly analytics: MatchAnalytics;
  readonly playersByXuid: ReadonlyMap<string, KillMatrixPresenterPlayerLookup>;
}

export class KillMatrixPresenter {
  public present({ analytics, playersByXuid }: KillMatrixPresenterOptions): KillMatrixViewRow[] {
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
        topWeaponId: this.topWeaponId(value.weapons),
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
    playersByXuid: ReadonlyMap<string, KillMatrixPresenterPlayerLookup>,
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

  private topWeaponId(weapons: readonly { readonly weaponId: number; readonly count: number }[]): number | null {
    if (weapons.length === 0) {
      return null;
    }

    let maxWeaponId = weapons[0].weaponId;
    let maxCount = weapons[0].count;

    for (let i = 1; i < weapons.length; i++) {
      const weapon = weapons[i];
      if (weapon.count > maxCount) {
        maxCount = weapon.count;
        maxWeaponId = weapon.weaponId;
      }
    }

    return maxWeaponId;
  }

  private parsePairKey(key: string): { killerXuid: string; victimXuid: string } {
    const [killerXuid, victimXuid] = key.split(":");
    return { killerXuid, victimXuid };
  }
}
