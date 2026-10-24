export type Quantum3 = readonly [number, number, number];

// the per-map bit layout of the absolute position component: gate bits, then X, Y, Z widths
export interface AxisLayout {
  readonly gateBits: number;
  readonly axisWidths: readonly [number, number, number];
}

export interface BipedPosition {
  readonly slot: number;
  readonly timestampMs: number;
  readonly timestampUs: bigint;
  readonly q: Quantum3;
}

export interface PositionSample {
  readonly timestampMs: number;
  readonly q: Quantum3;
}

export interface BipedLife {
  readonly slot: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly samples: readonly PositionSample[];
  readonly xuid: string | null;
}

export interface PlayerPositionTrack {
  readonly xuid: string;
  readonly teamId: number;
  readonly lives: readonly BipedLife[];
}

export interface PlayerPositions {
  readonly layout: AxisLayout;
  readonly tracks: readonly PlayerPositionTrack[];
  readonly unnamedLives: readonly BipedLife[];
}

export interface DeathEvent {
  readonly timestampMs: number;
  readonly xuid: string;
}
