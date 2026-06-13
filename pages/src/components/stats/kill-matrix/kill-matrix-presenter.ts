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

function createFallbackPlayer(xuid: string): KillMatrixPlayer {
  return {
    xuid,
    gamertag: xuid,
    teamId: null,
  };
}

function toPlayer(xuid: string, playersByXuid: ReadonlyMap<string, KillMatrixPresenterPlayerLookup>): KillMatrixPlayer {
  const entry = playersByXuid.get(xuid);
  if (entry == null) {
    return createFallbackPlayer(xuid);
  }

  return {
    xuid,
    gamertag: entry.gamertag,
    teamId: entry.teamId,
  };
}

function classify(killer: KillMatrixPlayer, victim: KillMatrixPlayer): KillMatrixClassification {
  if (killer.xuid === victim.xuid) {
    return "suicide";
  }

  if (killer.teamId != null && victim.teamId != null && killer.teamId === victim.teamId) {
    return "betrayal";
  }

  return "enemy-kill";
}

function topWeaponId(weapons: readonly { readonly weaponId: number; readonly count: number }[]): number | null {
  if (weapons.length === 0) {
    return null;
  }

  const sorted = [...weapons].sort((a, b) => b.count - a.count);
  return sorted[0]?.weaponId ?? null;
}

function parsePairKey(key: string): { killerXuid: string; victimXuid: string } {
  const [killerXuid, victimXuid] = key.split(":");
  return { killerXuid, victimXuid };
}

function presentKillMatrix({ analytics, playersByXuid }: KillMatrixPresenterOptions): KillMatrixViewRow[] {
  const rows: KillMatrixViewRow[] = [];

  for (const [key, value] of Object.entries(analytics.killMatrix)) {
    const { killerXuid, victimXuid } = parsePairKey(key);
    const killer = toPlayer(killerXuid, playersByXuid);
    const victim = toPlayer(victimXuid, playersByXuid);

    rows.push({
      key,
      killer,
      victim,
      count: value.count,
      headshotKills: value.headshotKills,
      perfects: value.perfects,
      classification: classify(killer, victim),
      topWeaponId: topWeaponId(value.weapons),
    });
  }

  return rows.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.key.localeCompare(right.key);
  });
}

export const KillMatrixPresenter = {
  present: presentKillMatrix,
};
