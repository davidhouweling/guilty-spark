import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { PLAYER_ADVANTAGE_SERIES, TICK_FILL, ZONE_ADVANTAGE_SERIES } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
  ChartTypeOption,
  CtfViewData,
  FlagRunMarkerLegendEntry,
  FlagRunsViewModel,
  KothHillData,
  OddballRoundData,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreLinesViewData,
  ScoreLinesViewModel,
  ScoreProgressionDeltaViewModel,
  ScoreProgressionViewData,
  ScoreProgressionViewModel,
  TimelineGanttChartViewModel,
  TimelineGanttRowViewModel,
  TimelineGanttTooltipEntry,
  ZoneStripData,
} from "./types";

export interface ScoreProgressionPresenterConfig {
  readonly store: ScoreProgressionStore;
}

export interface ScoreProgressionInput {
  readonly viewData: ScoreProgressionViewData;
  readonly ariaLabel: string;
}

const DELTA_LABEL = "Score Delta";

const TIMELINE_OPTION: ChartTypeOption = { value: "timeline", label: "Objective Timeline" };
const PROGRESSION_OPTION: ChartTypeOption = { value: "progression", label: "Score Progression" };
const DELTA_OPTION: ChartTypeOption = { value: "delta", label: DELTA_LABEL };
const FLAG_RUNS_OPTION: ChartTypeOption = { value: "timeline", label: "Flag Runs" };
const FLAG_PROGRESS_LABEL = "of the way to the capture point";
const FLAG_MARKER_LEGEND: readonly FlagRunMarkerLegendEntry[] = [
  { kind: "steal", text: "Steal" },
  { kind: "grab", text: "Pickup" },
  { kind: "drop", text: "Carrier killed" },
  { kind: "return", text: "Returned" },
  { kind: "capture", text: "Captured" },
];

export class ScoreProgressionPresenter {
  readonly onChartTypeChange: (value: string) => void;
  readonly onPlayerAdvantageChange: (checked: boolean) => void;
  readonly onMarkersChange: (checked: boolean) => void;
  readonly onZoneAdvantageChange: (checked: boolean) => void;

  constructor(private readonly config: ScoreProgressionPresenterConfig) {
    this.onChartTypeChange = (value: string): void => {
      this.setChartType(value);
    };
    this.onPlayerAdvantageChange = (checked: boolean): void => {
      this.setPlayerAdvantage(checked);
    };
    this.onMarkersChange = (checked: boolean): void => {
      this.config.store.update({ showMarkers: checked });
    };
    this.onZoneAdvantageChange = (checked: boolean): void => {
      this.config.store.update({ showZoneAdvantage: checked });
    };
  }

  present(snapshot: ScoreProgressionSnapshot, input: ScoreProgressionInput): ScoreProgressionViewModel {
    const { viewData, ariaLabel } = input;
    switch (viewData.kind) {
      case "score-lines": {
        return this.presentScoreLines(snapshot, viewData, ariaLabel, this.buildChartTypeOptions(viewData));
      }
      case "strongholds": {
        const { zoneStrip, scoreLines } = viewData;
        if (zoneStrip == null) {
          return this.presentScoreLines(snapshot, scoreLines, ariaLabel, this.buildChartTypeOptions(scoreLines));
        }
        return this.presentGanttMode(snapshot, ariaLabel, scoreLines.durationMs, {
          buildRows: (): TimelineGanttRowViewModel[] => [this.buildZoneStripRow(zoneStrip)],
          scoreLines,
          defaultChartType: "progression",
        });
      }
      case "koth": {
        return this.presentGanttMode(snapshot, ariaLabel, viewData.durationMs, {
          buildRows: (): TimelineGanttRowViewModel[] => viewData.hills.map((hill) => this.buildKothRow(hill)),
          scoreLines: viewData.scoreLines,
          defaultChartType: "timeline",
        });
      }
      case "oddball": {
        return this.presentGanttMode(snapshot, ariaLabel, viewData.durationMs, {
          buildRows: (): TimelineGanttRowViewModel[] => viewData.rounds.map((round) => this.buildOddballRow(round)),
          scoreLines: viewData.scoreLines,
          defaultChartType: "timeline",
        });
      }
      case "ctf": {
        return this.presentMode(snapshot, ariaLabel, {
          timelineOption: FLAG_RUNS_OPTION,
          presentTimeline: (chartTypeOptions): FlagRunsViewModel =>
            this.presentFlagRuns(snapshot, viewData, ariaLabel, chartTypeOptions),
          scoreLines: viewData.scoreLines,
          defaultChartType: "timeline",
        });
      }
      default: {
        throw new UnreachableError(viewData);
      }
    }
  }

  private presentGanttMode(
    snapshot: ScoreProgressionSnapshot,
    ariaLabel: string,
    durationMs: number,
    mode: {
      buildRows: () => readonly TimelineGanttRowViewModel[];
      scoreLines: ScoreLinesViewData | null;
      defaultChartType: ChartType;
    },
  ): ScoreProgressionViewModel {
    return this.presentMode(snapshot, ariaLabel, {
      timelineOption: TIMELINE_OPTION,
      presentTimeline: (chartTypeOptions): TimelineGanttChartViewModel =>
        this.presentTimelineGantt(ariaLabel, durationMs, mode.buildRows(), chartTypeOptions),
      scoreLines: mode.scoreLines,
      defaultChartType: mode.defaultChartType,
    });
  }

  private presentFlagRuns(
    snapshot: ScoreProgressionSnapshot,
    viewData: CtfViewData,
    ariaLabel: string,
    chartTypeOptions: readonly ChartTypeOption[],
  ): FlagRunsViewModel {
    const { showPlayerAdvantage } = snapshot;
    const { hasPlayerAdvantage, playerAdvantage: overlay } = this.resolvePlayerAdvantage(
      snapshot,
      viewData.advantageOverlay,
    );
    // the overlay draws the second team's lead above the home line, with that team's attacks
    const [secondLeadsName, firstLeadsName] = [...viewData.teamNames].reverse();
    return {
      kind: "flag-runs",
      ariaLabel,
      effectiveChartType: "timeline",
      chartTypeOptions,
      showChartTypeSelect: chartTypeOptions.length > 1,
      legend: viewData.legend,
      markerLegend: FLAG_MARKER_LEGEND,
      hasPlayerAdvantage,
      showPlayerAdvantage,
      chart: {
        durationMs: viewData.durationMs,
        runs: viewData.runs,
        points: overlay?.rows ?? viewData.points,
        advantageDomain: overlay != null ? this.mirrorDomain(overlay.minScore, overlay.maxScore) : null,
        tooltipFormatter: (value, name): [string, string] =>
          this.formatSeriesTooltip(value, name, secondLeadsName, firstLeadsName, () =>
            this.formatFlagProgressTooltip(value, name),
          ),
      },
      onChartTypeChange: this.onChartTypeChange,
      onPlayerAdvantageChange: this.onPlayerAdvantageChange,
    };
  }

  // the toggle is offered when the match has an advantage and honoured only then
  private resolvePlayerAdvantage<T>(
    snapshot: ScoreProgressionSnapshot,
    playerAdvantage: T | null,
  ): { hasPlayerAdvantage: boolean; playerAdvantage: T | null } {
    return {
      hasPlayerAdvantage: playerAdvantage != null,
      playerAdvantage: snapshot.showPlayerAdvantage ? playerAdvantage : null,
    };
  }

  // a domain mirrored around zero so its zero line meets the other axis's
  private mirrorDomain(minScore: number, maxScore: number): readonly [number, number] {
    const extent = Math.max(Math.abs(minScore), Math.abs(maxScore));
    return [-extent, extent];
  }

  private formatFlagProgressTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ): [string, string] {
    const label = this.toTooltipLabel(name);
    if (typeof value !== "number" || Number.isNaN(value)) {
      return [String(value ?? ""), label];
    }
    return [`${String(Math.abs(Math.round(value)))}% ${FLAG_PROGRESS_LABEL}`, label];
  }

  private toTooltipLabel(name: string | number | undefined): string {
    return typeof name === "string" ? name : String(name ?? "");
  }

  // an unset chart type resolves to the mode's default, whose option group leads the select
  private presentMode(
    snapshot: ScoreProgressionSnapshot,
    ariaLabel: string,
    mode: {
      timelineOption: ChartTypeOption;
      presentTimeline: (chartTypeOptions: readonly ChartTypeOption[]) => ScoreProgressionViewModel;
      scoreLines: ScoreLinesViewData | null;
      defaultChartType: ChartType;
    },
  ): ScoreProgressionViewModel {
    const { timelineOption, presentTimeline, scoreLines, defaultChartType } = mode;
    const scoreOptions = this.buildChartTypeOptions(scoreLines);
    const chartTypeOptions =
      defaultChartType === "timeline" ? [timelineOption, ...scoreOptions] : [...scoreOptions, timelineOption];
    const wantsTimeline = (snapshot.chartType ?? defaultChartType) === "timeline";
    if (scoreLines == null || wantsTimeline) {
      return presentTimeline(chartTypeOptions);
    }
    return this.presentScoreLines(snapshot, scoreLines, ariaLabel, chartTypeOptions);
  }

  private buildZoneStripRow(zoneStrip: ZoneStripData): TimelineGanttRowViewModel {
    return {
      rowIndex: 1,
      label: "Zones",
      subLabel: this.buildPercentSubLabel(zoneStrip.teamShares),
      segments: zoneStrip.segments,
      winnerColor: null,
      tooltipTitle: "Zone control — share of the match ahead",
      tooltipEntries: zoneStrip.teamShares.map((share) =>
        this.buildTooltipEntry(
          share.teamId,
          share.color,
          share.percentage,
          `${share.name}: ahead ${String(share.percentage)}%`,
        ),
      ),
    };
  }

  private buildPercentSubLabel(entries: readonly { name: string; percentage: number }[]): string {
    return entries.map((entry) => `${entry.name} ${String(entry.percentage)}%`).join(" · ");
  }

  private buildChartTypeOptions(viewData: ScoreLinesViewData | null): ChartTypeOption[] {
    if (viewData == null) {
      return [];
    }
    return [PROGRESSION_OPTION, ...(viewData.scoreDelta != null ? [DELTA_OPTION] : [])];
  }

  private presentScoreLines(
    snapshot: ScoreProgressionSnapshot,
    viewData: ScoreLinesViewData,
    ariaLabel: string,
    chartTypeOptions: readonly ChartTypeOption[],
  ): ScoreLinesViewModel {
    const { chartType, showPlayerAdvantage, showMarkers, showZoneAdvantage } = snapshot;
    // an unset or unavailable chart type (timeline on a score-lines mode, delta without delta
    // data) resolves to the progression chart
    const effectiveChartType: ChartType =
      chartType === "delta" && viewData.scoreDelta != null ? "delta" : "progression";
    const { hasPlayerAdvantage, playerAdvantage: effectivePlayerAdvantage } = this.resolvePlayerAdvantage(
      snapshot,
      viewData.playerAdvantage,
    );
    const effectiveZoneAdvantage = showZoneAdvantage ? viewData.zoneAdvantage : null;
    // markers only draw on the progression chart, so the toggle hides on the delta view rather
    // than sitting inert
    const hasMarkers = viewData.markers != null && effectiveChartType === "progression";
    const effectiveMarkers = hasMarkers && showMarkers ? viewData.markers : null;
    const advantageDomain = this.buildAdvantageDomain(effectivePlayerAdvantage, effectiveZoneAdvantage);

    const team0Name = viewData.teamLines[0]?.name ?? "Team 1";
    const team1Name = viewData.teamLines[1]?.name ?? "Team 2";

    const syncedScoreDelta =
      viewData.scoreDelta != null ? this.synchronizeDeltaDomain(viewData.scoreDelta, advantageDomain != null) : null;

    const deltaViewModel: ScoreProgressionDeltaViewModel | null =
      effectiveChartType === "delta" && syncedScoreDelta != null
        ? {
            durationMs: viewData.durationMs,
            roundBoundaries: viewData.roundBoundaries,
            scoreDelta: syncedScoreDelta,
            team0Color: viewData.teamLines[0]?.color ?? TICK_FILL,
            team1Color: viewData.teamLines[1]?.color ?? TICK_FILL,
            playerAdvantage: effectivePlayerAdvantage,
            zoneAdvantage: effectiveZoneAdvantage,
            advantageDomain,
            tooltipFormatter: (
              value: number | string | readonly (number | string)[] | undefined,
              name: string | number | undefined,
            ): [string, string] => this.formatDeltaChartTooltip(value, name, team0Name, team1Name),
          }
        : null;

    const hasZoneAdvantage = viewData.zoneAdvantage != null;
    const showChartTypeSelect = chartTypeOptions.length > 1;

    return {
      kind: "score-lines",
      ariaLabel,
      effectiveChartType,
      chartTypeOptions,
      showChartTypeSelect,
      hasPlayerAdvantage,
      hasMarkers,
      hasZoneAdvantage,
      showPlayerAdvantage,
      showMarkers,
      showZoneAdvantage,
      deltaViewModel,
      progressionViewModel: {
        durationMs: viewData.durationMs,
        roundBoundaries: viewData.roundBoundaries,
        teamLines: viewData.teamLines,
        playerAdvantage: effectivePlayerAdvantage,
        zoneAdvantage: effectiveZoneAdvantage,
        advantageDomain,
        markers: effectiveMarkers,
        tooltipFormatter: (
          value: number | string | readonly (number | string)[] | undefined,
          name: string | number | undefined,
        ): [string, string] => this.formatProgressionTooltip(value, name, team0Name, team1Name),
      },
      onChartTypeChange: this.onChartTypeChange,
      onPlayerAdvantageChange: this.onPlayerAdvantageChange,
      onMarkersChange: this.onMarkersChange,
      onZoneAdvantageChange: this.onZoneAdvantageChange,
    };
  }

  // one shared right-hand axis serves every enabled advantage overlay, so its domain is the
  // widest of them
  private buildAdvantageDomain(
    playerAdvantage: PlayerAdvantageData | null,
    zoneAdvantage: PlayerAdvantageData | null,
  ): readonly [number, number] | null {
    const overlays = [playerAdvantage, zoneAdvantage].filter((overlay) => overlay != null);
    if (overlays.length === 0) {
      return null;
    }
    return [Math.min(...overlays.map((o) => o.minScore)), Math.max(...overlays.map((o) => o.maxScore))];
  }

  private presentTimelineGantt(
    ariaLabel: string,
    durationMs: number,
    rows: readonly TimelineGanttRowViewModel[],
    chartTypeOptions: readonly ChartTypeOption[],
  ): TimelineGanttChartViewModel {
    return {
      kind: "timeline-gantt",
      ariaLabel,
      effectiveChartType: "timeline",
      chartTypeOptions,
      showChartTypeSelect: chartTypeOptions.length > 1,
      timeline: {
        durationMs,
        rows: this.orderRowsForVerticalChart(rows),
      },
      onChartTypeChange: this.onChartTypeChange,
    };
  }

  // Recharts vertical BarChart renders rows top-down, so row 1 must be last to sit at the bottom
  private orderRowsForVerticalChart(rows: readonly TimelineGanttRowViewModel[]): TimelineGanttRowViewModel[] {
    return [...rows].reverse();
  }

  private buildKothRow(hill: KothHillData): TimelineGanttRowViewModel {
    return {
      rowIndex: hill.hillIndex,
      label: `Hill ${String(hill.hillIndex)}`,
      subLabel: this.buildPercentSubLabel(hill.teamCaptureProgress),
      segments: hill.segments,
      winnerColor: hill.winnerColor,
      tooltipTitle: `Hill ${String(hill.hillIndex)}`,
      tooltipEntries: hill.teamCaptureProgress.map((o) =>
        this.buildTooltipEntry(o.teamId, o.color, o.percentage, `${o.name}: ${String(o.percentage)}%`),
      ),
    };
  }

  private buildOddballRow(round: OddballRoundData): TimelineGanttRowViewModel {
    const ending = round.endedByCap ? "Capped" : "Timed out";
    return {
      rowIndex: round.roundIndex,
      label: `Round ${String(round.roundIndex)}`,
      subLabel: round.teamScores.map((o) => `${o.name} ${String(o.score)}`).join(" · "),
      segments: round.segments,
      winnerColor: round.winnerColor,
      tooltipTitle:
        round.winnerName != null
          ? `Round ${String(round.roundIndex)} — ${ending}, ${round.winnerName} wins`
          : `Round ${String(round.roundIndex)} — ${ending}`,
      tooltipEntries: round.teamScores.map((o) =>
        this.buildTooltipEntry(o.teamId, o.color, o.score, `${o.name}: ${String(o.score)}`),
      ),
    };
  }

  // teams that never scored render muted in the tooltip
  private buildTooltipEntry(teamId: number, color: string, value: number, text: string): TimelineGanttTooltipEntry {
    return { key: String(teamId), color: value > 0 ? color : null, text };
  }

  private synchronizeDeltaDomain(scoreDelta: ScoreDeltaData, hasAdvantageOverlay: boolean): ScoreDeltaData {
    if (!hasAdvantageOverlay) {
      return scoreDelta;
    }
    const [minScore, maxScore] = this.mirrorDomain(scoreDelta.minScore, scoreDelta.maxScore);
    return { ...scoreDelta, minScore, maxScore };
  }

  private setChartType(value: string): void {
    if (value === "timeline" || value === "progression" || value === "delta") {
      this.config.store.update({ chartType: value });
    }
  }

  private setPlayerAdvantage(checked: boolean): void {
    this.config.store.update({ showPlayerAdvantage: checked });
  }

  private formatProgressionTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    return this.formatSeriesTooltip(value, name, team0Name, team1Name, () => [
      String(value ?? ""),
      this.toTooltipLabel(name),
    ]);
  }

  private formatDeltaChartTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    return this.formatSeriesTooltip(value, name, team0Name, team1Name, () =>
      this.formatDeltaTooltip(value, team0Name, team1Name),
    );
  }

  // routes the advantage overlay series to their formatters; anything else takes the chart's
  // own fallback
  private formatSeriesTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
    team0Name: string,
    team1Name: string,
    fallback: () => [string, string],
  ): [string, string] {
    if (name === PLAYER_ADVANTAGE_SERIES) {
      return this.formatAdvantageTooltip(value, team0Name, team1Name);
    }
    if (name === ZONE_ADVANTAGE_SERIES) {
      return this.formatZoneAdvantageTooltip(value, team0Name, team1Name);
    }
    return fallback();
  }

  private formatZoneAdvantageTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    return this.formatLeaderTooltip(value, team0Name, team1Name, ZONE_ADVANTAGE_SERIES, "Even", (lead) => {
      return `+${String(lead)} ${lead === 1 ? "zone" : "zones"}`;
    });
  }

  // the shared leader/even shape of every signed-series tooltip: positive means team 0 leads
  private formatLeaderTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
    label: string,
    evenText: string,
    formatLead: (lead: number) => string = (lead) => `+${String(lead)}`,
  ): [string, string] {
    if (typeof value !== "number" || value === 0 || Number.isNaN(value)) {
      return [evenText, label];
    }
    const leader = value > 0 ? team0Name : team1Name;
    return [`${leader} ${formatLead(Math.abs(value))}`, label];
  }

  private formatAdvantageTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    return this.formatLeaderTooltip(value, team0Name, team1Name, PLAYER_ADVANTAGE_SERIES, "Even");
  }

  private formatDeltaTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    return this.formatLeaderTooltip(value, team0Name, team1Name, DELTA_LABEL, "Tied");
  }
}
