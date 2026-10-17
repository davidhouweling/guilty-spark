export interface StatValue {
  a: number;
  b: number;
}

// One entity record from a replication FRAME packet: the sparse set of stat components an
// entity re-transmitted at this instant. Slots 6 and 8 are the two teams, 10..24 (even) the
// eight players.
export interface StatRecord {
  timestampMs: number;
  slot: number;
  components: Map<number, StatValue>;
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
