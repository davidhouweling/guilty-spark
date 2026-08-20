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
}

export interface PlayerAdvantageData {
  readonly points: readonly ScoreProgressionPoint[];
  readonly minScore: number;
  readonly maxScore: number;
}

export interface KothHillSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly teamId: number | null;
  readonly color: string | null;
}

export interface KothHillTeamProgress {
  readonly teamId: number;
  readonly name: string;
  readonly color: string;
  readonly percentage: number;
}

export interface KothHillData {
  readonly hillIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly segments: readonly KothHillSegment[];
  readonly winnerTeamId: number | null;
  readonly winnerColor: string | null;
  readonly winnerName: string | null;
  readonly teamCaptureProgress: readonly KothHillTeamProgress[];
}

export interface KothTimelineHillViewModel extends KothHillData {
  readonly captureProgressLabel: string;
}

export interface KothTimelineViewModel {
  readonly durationMs: number;
  readonly hills: readonly KothTimelineHillViewModel[];
}

export interface ScoreLinesViewData {
  readonly kind: "score-lines";
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
  readonly playerAdvantage: PlayerAdvantageData | null;
}

export interface KothViewData {
  readonly kind: "koth";
  readonly durationMs: number;
  readonly hills: readonly KothHillData[];
}

export type ScoreProgressionViewData = ScoreLinesViewData | KothViewData;

export type ChartType = "progression" | "delta";

export interface ScoreProgressionDeltaViewModel {
  readonly durationMs: number;
  readonly scoreDelta: ScoreDeltaData;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly playerAdvantage: PlayerAdvantageData | null;
  readonly tooltipFormatter: (value: number | string | readonly (number | string)[] | undefined) => [string, string];
  readonly advantageTooltipFormatter: (
    value: number | string | readonly (number | string)[] | undefined,
  ) => [string, string];
}

export interface ScoreProgressionProgressionViewModel {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly playerAdvantage: PlayerAdvantageData | null;
  readonly tooltipFormatter: (
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ) => [string, string];
}

export interface ScoreLinesViewModel {
  readonly kind: "score-lines";
  readonly ariaLabel: string;
  readonly effectiveChartType: ChartType;
  readonly hasDelta: boolean;
  readonly hasPlayerAdvantage: boolean;
  readonly showPlayerAdvantage: boolean;
  readonly showToolbar: boolean;
  readonly deltaViewModel: ScoreProgressionDeltaViewModel | null;
  readonly progressionViewModel: ScoreProgressionProgressionViewModel;
  readonly onChartTypeChange: (value: string) => void;
  readonly onPlayerAdvantageChange: (checked: boolean) => void;
}

export interface KothViewModel {
  readonly kind: "koth";
  readonly ariaLabel: string;
  readonly kothTimelineViewModel: KothTimelineViewModel;
}

export type ScoreProgressionViewModel = ScoreLinesViewModel | KothViewModel;
