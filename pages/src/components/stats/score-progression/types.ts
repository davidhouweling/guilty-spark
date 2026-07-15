export interface ScoreProgressionPoint {
  readonly timestampMs: number;
  readonly score: number;
}

export interface ScoreProgressionTeamLine {
  readonly teamId: number;
  readonly name: string;
  readonly color: string;
  readonly points: readonly ScoreProgressionPoint[];
}

export interface ScoreDeltaData {
  readonly points: readonly ScoreProgressionPoint[];
  readonly minScore: number;
  readonly maxScore: number;
  readonly zeroFraction: number;
}

export interface ScoreProgressionViewData {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
}
