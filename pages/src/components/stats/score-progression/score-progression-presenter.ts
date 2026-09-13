import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { PLAYER_ADVANTAGE_SERIES, TICK_FILL, ZONE_ADVANTAGE_SERIES } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
  ChartTypeOption,
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
        return this.presentScoreLines(snapshot, viewData, ariaLabel);
      }
      case "koth": {
        return this.presentTimelineGantt(
          ariaLabel,
          viewData.durationMs,
          viewData.hills.map((hill) => this.buildKothRow(hill)),
          [TIMELINE_OPTION],
        );
      }
      case "oddball": {
        return this.presentOddball(snapshot, viewData, ariaLabel);
      }
      default: {
        throw new UnreachableError(viewData);
      }
    }
  }

  // Oddball defaults to its rounds timeline and offers the score-lines charts through the
  // chart-type select; the score-lines presentation itself is shared with kill-race/strongholds.
  private presentOddball(
    snapshot: ScoreProgressionSnapshot,
    viewData: Extract<ScoreProgressionViewData, { kind: "oddball" }>,
    ariaLabel: string,
  ): ScoreProgressionViewModel {
    const chartTypeOptions: ChartTypeOption[] =
      viewData.scoreLines != null
        ? [TIMELINE_OPTION, PROGRESSION_OPTION, ...(viewData.scoreLines.scoreDelta != null ? [DELTA_OPTION] : [])]
        : [TIMELINE_OPTION];
    if (viewData.scoreLines != null && snapshot.chartType !== "timeline") {
      return this.presentScoreLines(snapshot, viewData.scoreLines, ariaLabel, chartTypeOptions);
    }
    return this.presentTimelineGantt(
      ariaLabel,
      viewData.durationMs,
      viewData.rounds.map((round) => this.buildOddballRow(round)),
      chartTypeOptions,
    );
  }

  private presentScoreLines(
    snapshot: ScoreProgressionSnapshot,
    viewData: ScoreLinesViewData,
    ariaLabel: string,
    chartTypeOptions: readonly ChartTypeOption[] = [PROGRESSION_OPTION, DELTA_OPTION],
  ): ScoreLinesViewModel {
    const { chartType, showPlayerAdvantage, showMarkers, showZoneAdvantage } = snapshot;
    // "timeline" belongs to the gantt modes; score-lines rendering resolves it (and a delta
    // request without delta data) to the progression chart
    const effectiveChartType: ChartType =
      chartType === "delta" && viewData.scoreDelta != null ? "delta" : "progression";
    const effectivePlayerAdvantage = showPlayerAdvantage ? viewData.playerAdvantage : null;
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

    const hasPlayerAdvantage = viewData.playerAdvantage != null;
    const hasZoneAdvantage = viewData.zoneAdvantage != null;
    const resolvedOptions =
      viewData.scoreDelta == null ? chartTypeOptions.filter((option) => option.value !== "delta") : chartTypeOptions;

    return {
      kind: "score-lines",
      ariaLabel,
      effectiveChartType,
      chartTypeOptions: resolvedOptions,
      hasPlayerAdvantage,
      hasMarkers,
      hasZoneAdvantage,
      showPlayerAdvantage,
      showMarkers,
      showZoneAdvantage,
      showToolbar: resolvedOptions.length > 1 || hasPlayerAdvantage || hasMarkers || hasZoneAdvantage,
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
      chartTypeOptions,
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
      subLabel: hill.teamCaptureProgress.map((o) => `${o.name} ${String(o.percentage)}%`).join(" · "),
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
    const maxAbsDelta = Math.max(Math.abs(scoreDelta.minScore), Math.abs(scoreDelta.maxScore));
    return { ...scoreDelta, minScore: -maxAbsDelta, maxScore: maxAbsDelta };
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
      typeof name === "string" ? name : String(name ?? ""),
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
