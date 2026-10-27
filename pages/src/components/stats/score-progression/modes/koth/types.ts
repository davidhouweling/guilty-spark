export interface KothHillEvent {
  readonly timestampMs: number;
  readonly teamId: number;
  readonly ticksByTeam: Record<string, number>;
}

export interface KothHillWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly captureTs: number | null;
  readonly events: readonly KothHillEvent[];
  readonly winnerTeamId: number | null;
  readonly ticksPerFullMeter: number;
}
