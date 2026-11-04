export interface StatValue {
  a: number;
  b: number;
}

// Slots 6 and 8 are the two teams, 10..24 (even) the eight players. Every counter restarts at
// zero in each round, so a record's round is part of its identity.
export interface StatRecord {
  timestampMs: number;
  slot: number;
  round: number;
  components: Map<number, StatValue>;
}

export const REGULATION_ROUND = 0;

// a round's window on the film clock, inclusive at both ends; null where nothing bounds it
export interface RoundBounds {
  round: number;
  startMs: number | null;
  endMs: number | null;
}

export type StatSide = "a" | "b";

export interface StatSlotKey {
  component: number;
  side: StatSide;
}

export type CtfFlagEventKind =
  "steal" | "grab" | "capture" | "captureAssist" | "return" | "secure" | "carrierKilled" | "returnerKilled";

export interface CtfFlagEvent {
  timestampMs: number;
  kind: CtfFlagEventKind;
  xuid: string;
  teamId: number;
}

export interface CtfFlagEvents {
  events: CtfFlagEvent[];
  unresolvedSlots: number[];
}
