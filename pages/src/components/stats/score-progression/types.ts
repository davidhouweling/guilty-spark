export interface ScoreProgressionPoint {
  readonly timestampMs: number;
  readonly score: number;
}

export interface ScoreSample {
  readonly timestampMs: number;
  readonly runningScores: Record<string, number>;
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
  // kill events step the score; zone scoring accrues continuously and renders as ramps
  readonly lineType: "step" | "linear";
}

export interface PlayerAdvantageData {
  readonly points: readonly ScoreProgressionPoint[];
  readonly minScore: number;
  readonly maxScore: number;
}

export interface ScoreMarkerData {
  readonly timestampMs: number;
  readonly score: number;
  readonly teamId: number;
  readonly teamName: string;
  readonly color: string;
  readonly kind: "capture" | "secure";
}

export interface TimelineGanttSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly teamId: number | null;
  readonly color: string | null;
  // scales the renderer's base segment opacity; 1 when omitted
  readonly opacity?: number | undefined;
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
  readonly markers: readonly ScoreMarkerData[] | null;
  readonly zoneAdvantage: PlayerAdvantageData | null;
  // round starts after the first, for modes whose score resets per round; empty otherwise
  readonly roundBoundaries: readonly number[];
}

export interface ZoneStripTeamShare {
  readonly teamId: number;
  readonly name: string;
  readonly color: string;
  // share of the match this team held more zones than the opponent
  readonly leadPercentage: number;
}

export interface ZoneStripData {
  readonly segments: readonly TimelineGanttSegment[];
  readonly teamShares: readonly ZoneStripTeamShare[];
}

export interface StrongholdsViewData {
  readonly kind: "strongholds";
  readonly durationMs: number;
  readonly zoneStrip: ZoneStripData | null;
  readonly scoreLines: ScoreLinesViewData;
}

export interface KothViewData {
  readonly kind: "koth";
  readonly durationMs: number;
  readonly hills: readonly KothHillData[];
  readonly scoreLines: ScoreLinesViewData | null;
}

export interface OddballViewData {
  readonly kind: "oddball";
  readonly durationMs: number;
  readonly rounds: readonly OddballRoundData[];
  readonly scoreLines: ScoreLinesViewData | null;
}

export type ScoreProgressionViewData = ScoreLinesViewData | StrongholdsViewData | KothViewData | OddballViewData;

export type ChartType = "timeline" | "progression" | "delta";

export interface ChartTypeOption {
  readonly value: ChartType;
  readonly label: string;
}

export interface ScoreProgressionDeltaViewModel {
  readonly durationMs: number;
  readonly scoreDelta: ScoreDeltaData;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly playerAdvantage: PlayerAdvantageData | null;
  readonly zoneAdvantage: PlayerAdvantageData | null;
  readonly advantageDomain: readonly [number, number] | null;
  readonly roundBoundaries: readonly number[];
  readonly tooltipFormatter: (
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ) => [string, string];
}

export interface ScoreProgressionProgressionViewModel {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly playerAdvantage: PlayerAdvantageData | null;
  readonly zoneAdvantage: PlayerAdvantageData | null;
  readonly advantageDomain: readonly [number, number] | null;
  readonly markers: readonly ScoreMarkerData[] | null;
  readonly roundBoundaries: readonly number[];
  readonly tooltipFormatter: (
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ) => [string, string];
}

export interface ScoreLinesViewModel {
  readonly kind: "score-lines";
  readonly ariaLabel: string;
  readonly effectiveChartType: ChartType;
  readonly chartTypeOptions: readonly ChartTypeOption[];
  readonly showChartTypeSelect: boolean;
  readonly hasPlayerAdvantage: boolean;
  readonly hasMarkers: boolean;
  readonly hasZoneAdvantage: boolean;
  readonly showPlayerAdvantage: boolean;
  readonly showMarkers: boolean;
  readonly showZoneAdvantage: boolean;
  readonly showToolbar: boolean;
  readonly deltaViewModel: ScoreProgressionDeltaViewModel | null;
  readonly progressionViewModel: ScoreProgressionProgressionViewModel;
  readonly onChartTypeChange: (value: string) => void;
  readonly onPlayerAdvantageChange: (checked: boolean) => void;
  readonly onMarkersChange: (checked: boolean) => void;
  readonly onZoneAdvantageChange: (checked: boolean) => void;
}

export interface TimelineGanttChartViewModel {
  readonly kind: "timeline-gantt";
  readonly ariaLabel: string;
  readonly effectiveChartType: ChartType;
  readonly chartTypeOptions: readonly ChartTypeOption[];
  readonly showChartTypeSelect: boolean;
  readonly timeline: TimelineGanttViewModel;
  readonly onChartTypeChange: (value: string) => void;
}

export type ScoreProgressionViewModel = ScoreLinesViewModel | TimelineGanttChartViewModel;
