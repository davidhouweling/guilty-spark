export type Quantum3 = readonly [number, number, number];

// the per-map bit layout of the absolute position component: gate bits, then X, Y, Z widths
export interface AxisLayout {
  readonly gateBits: number;
  readonly axisWidths: readonly [number, number, number];
}

export interface BipedPosition {
  readonly slot: number;
  readonly timestampMs: number;
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

// feedOffsetMs moves the highlight feed's clock onto the film clock; null when the feed could
// not be aligned (no deaths matched a life end)
export interface PlayerPositions {
  readonly layout: AxisLayout;
  readonly tracks: readonly PlayerPositionTrack[];
  readonly unnamedLives: readonly BipedLife[];
  readonly feedOffsetMs: number | null;
}

export interface DeathEvent {
  readonly timestampMs: number;
  readonly xuid: string;
}

// the window on the match clock in which a player is expected to own a biped
export interface RosterMember {
  readonly xuid: string;
  readonly teamId: number;
  readonly presentFromMs: number;
  readonly presentToMs: number;
}

export interface SlotPrefilter {
  readonly bits: number;
  readonly value: number;
}

export interface BipedHeader {
  readonly slot: number;
  readonly positionBit: number;
}

export interface ScannedBiped {
  readonly slot: number;
  readonly q: Quantum3;
}

export interface FlipProfile {
  readonly pairs: number;
  readonly flipRates: readonly number[];
}

export interface DecodedPositions {
  readonly layout: AxisLayout;
  readonly slots: ReadonlySet<number>;
  readonly scanned: readonly BipedPosition[];
}

export interface DeathLifePairing {
  readonly deathIndex: number;
  readonly lifeIndex: number;
}

// offsetMs is null when the feed cannot be aligned to the film clock; pairings index into the
// deaths and lives the alignment was measured on
export interface DeathAlignment {
  readonly offsetMs: number | null;
  readonly pairings: readonly DeathLifePairing[];
}
