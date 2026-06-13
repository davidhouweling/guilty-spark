import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export type KillMatrixClassification = "enemy-kill" | "betrayal" | "suicide";

export interface KillMatrixPlayer {
  readonly xuid: string;
  readonly gamertag: string;
  readonly teamId: number | null;
}

export interface KillMatrixViewRow {
  readonly key: string;
  readonly killer: KillMatrixPlayer;
  readonly victim: KillMatrixPlayer;
  readonly count: number;
  readonly headshotKills: number;
  readonly perfects: number;
  readonly classification: KillMatrixClassification;
  readonly topWeaponId: number | null;
}

export type KillMatrixRaw = MatchAnalytics["killMatrix"];
