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

export interface TimelineGanttSegment {
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
  readonly segments: readonly TimelineGanttSegment[];
  readonly winnerTeamId: number | null;
  readonly winnerColor: string | null;
  readonly winnerName: string | null;
  readonly teamCaptureProgress: readonly KothHillTeamProgress[];
}

export interface OddballRoundTeamScore {
  readonly teamId: number;
  readonly name: string;
  readonly color: string;
  readonly score: number;
}

export interface OddballRoundData {
  readonly roundIndex: number;
  readonly endedByCap: boolean;
  readonly segments: readonly TimelineGanttSegment[];
  readonly winnerColor: string | null;
  readonly winnerName: string | null;
  readonly teamScores: readonly OddballRoundTeamScore[];
}

export interface TimelineGanttTooltipEntry {
  readonly key: string;
  readonly color: string | null;
  readonly text: string;
}

export interface TimelineGanttRowViewModel {
  readonly rowIndex: number;
  readonly label: string;
  readonly subLabel: string;
  readonly segments: readonly TimelineGanttSegment[];
  readonly winnerColor: string | null;
  readonly tooltipTitle: string;
  readonly tooltipEntries: readonly TimelineGanttTooltipEntry[];
}

export interface TimelineGanttViewModel {
  readonly durationMs: number;
  readonly rows: readonly TimelineGanttRowViewModel[];
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

export interface OddballViewData {
  readonly kind: "oddball";
  readonly durationMs: number;
  readonly rounds: readonly OddballRoundData[];
}

export type ScoreProgressionViewData = ScoreLinesViewData | KothViewData | OddballViewData;

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

export interface TimelineGanttChartViewModel {
  readonly kind: "timeline-gantt";
  readonly ariaLabel: string;
  readonly timeline: TimelineGanttViewModel;
}

export type ScoreProgressionViewModel = ScoreLinesViewModel | TimelineGanttChartViewModel;
