export interface KothHillPeriod {
  readonly startMs: number;
  readonly endMs: number;
  readonly captureTs: number | null;
}

export interface KothHillEvent {
  readonly timestampMs: number;
  readonly teamId: number;
  readonly ticksByTeam: Record<string, number>;
}

export interface ScannedKothHill extends KothHillPeriod {
  readonly events: readonly KothHillEvent[];
  readonly winnerTeamId: number | null;
}

export interface KothHillWindow extends ScannedKothHill {
  readonly ticksPerFullMeter: number;
}
