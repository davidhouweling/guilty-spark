import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export type KillMatrixClassification = "enemy-kill" | "betrayal" | "suicide";

export interface KillMatrixPivotRow {
  readonly killerId: string;
  readonly killerGamertag: string;
  readonly [victimGamertag: string]: string | number;
}

export interface KillMatrixPivotData {
  readonly tableRows: readonly KillMatrixPivotRow[];
  readonly victimGamertags: readonly string[];
}

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
}

export type KillMatrixRaw = MatchAnalytics["killMatrix"];
