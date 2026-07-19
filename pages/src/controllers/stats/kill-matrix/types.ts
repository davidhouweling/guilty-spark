import type { KillMatrixWeaponUsage, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export type { KillMatrixWeaponUsage };

export type KillMatrixClassification = "enemy-kill" | "betrayal" | "suicide";

export interface KillMatrixColumnHeader {
  readonly gamertag: string;
  readonly teamId: number | null;
  readonly xuid: string;
}

export interface KillMatrixPivotRow {
  readonly killerId: string;
  readonly killerGamertag: string;
  readonly killerTeamId: number | null;
  readonly kills: ReadonlyMap<string, number>; // keyed by victim gamertag
  readonly perfects: ReadonlyMap<string, number>; // keyed by victim gamertag
  readonly weapons: ReadonlyMap<string, readonly KillMatrixWeaponUsage[]>; // keyed by victim gamertag
}

export interface KillMatrixPivotData {
  readonly tableRows: readonly KillMatrixPivotRow[];
  readonly columnHeaders: readonly KillMatrixColumnHeader[];
}

export const EMPTY_KILL_MATRIX_PIVOT_DATA: KillMatrixPivotData = { tableRows: [], columnHeaders: [] };

export interface KillMatrixCrossTeamCell {
  readonly kills: number;
  readonly deaths: number;
  readonly killPerfects: number;
  readonly deathPerfects: number;
  readonly killWeapons: readonly KillMatrixWeaponUsage[];
  readonly deathWeapons: readonly KillMatrixWeaponUsage[];
}

export interface H2HWeaponRow {
  readonly weaponId: string;
  readonly name: string;
  readonly aCount: number;
  readonly bCount: number;
}

export interface H2HDialogData {
  readonly playerA: { readonly gamertag: string; readonly teamId: number | null };
  readonly playerB: { readonly gamertag: string; readonly teamId: number | null };
  readonly aKillsOnB: number;
  readonly bKillsOnA: number;
  readonly aPerfsOnB: number;
  readonly bPerfsOnA: number;
  readonly weaponRows: readonly H2HWeaponRow[];
}

export interface KillMatrixCrossTeamRow {
  readonly playerId: string;
  readonly playerGamertag: string;
  readonly playerTeamId: number | null;
  readonly cells: ReadonlyMap<string, KillMatrixCrossTeamCell>;
}

export interface KillMatrixCrossTeamFootnote {
  readonly betrayals: number;
  readonly suicides: number;
}

export interface KillMatrixCrossTeamData {
  readonly tableRows: readonly KillMatrixCrossTeamRow[];
  readonly columnHeaders: readonly KillMatrixColumnHeader[];
  readonly footnote: KillMatrixCrossTeamFootnote | null;
}

export const EMPTY_KILL_MATRIX_CROSS_TEAM_DATA: KillMatrixCrossTeamData = {
  tableRows: [],
  columnHeaders: [],
  footnote: null,
};

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
  readonly weapons: readonly KillMatrixWeaponUsage[];
  readonly classification: KillMatrixClassification;
}

export type KillMatrixRaw = MatchAnalytics["killMatrix"];
