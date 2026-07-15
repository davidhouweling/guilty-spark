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

export type ChartType = "progression" | "delta";

export interface ScoreProgressionDeltaViewModel {
  readonly durationMs: number;
  readonly scoreDelta: ScoreDeltaData;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly tooltipFormatter: (value: unknown) => [string, string];
}

export interface ScoreProgressionProgressionViewModel {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
}

export interface ScoreProgressionViewModel {
  readonly ariaLabel: string;
  readonly effectiveChartType: ChartType;
  readonly hasDelta: boolean;
  readonly deltaViewModel: ScoreProgressionDeltaViewModel | null;
  readonly progressionViewModel: ScoreProgressionProgressionViewModel;
  readonly onChartTypeChange: (value: string) => void;
}
