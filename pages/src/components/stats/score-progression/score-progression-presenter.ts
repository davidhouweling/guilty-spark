import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { TICK_FILL } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
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

export class ScoreProgressionPresenter {
  readonly onChartTypeChange: (value: string) => void;
  readonly onPlayerAdvantageChange: (checked: boolean) => void;

  constructor(private readonly config: ScoreProgressionPresenterConfig) {
    this.onChartTypeChange = (value: string): void => {
      this.setChartType(value);
    };
    this.onPlayerAdvantageChange = (checked: boolean): void => {
      this.setPlayerAdvantage(checked);
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
        );
      }
      case "oddball": {
        return this.presentTimelineGantt(
          ariaLabel,
          viewData.durationMs,
          viewData.rounds.map((round) => this.buildOddballRow(round)),
        );
      }
      default: {
        throw new UnreachableError(viewData);
      }
    }
  }

  private presentScoreLines(
    snapshot: ScoreProgressionSnapshot,
    viewData: ScoreLinesViewData,
    ariaLabel: string,
  ): ScoreLinesViewModel {
    const { chartType, showPlayerAdvantage } = snapshot;
    const effectiveChartType: ChartType =
      chartType === "delta" && viewData.scoreDelta == null ? "progression" : chartType;
    const effectivePlayerAdvantage = showPlayerAdvantage ? viewData.playerAdvantage : null;

    const team0Name = viewData.teamLines[0]?.name ?? "Team 1";
    const team1Name = viewData.teamLines[1]?.name ?? "Team 2";

    const syncedScoreDelta =
      viewData.scoreDelta != null ? this.synchronizeDeltaDomain(viewData.scoreDelta, effectivePlayerAdvantage) : null;

    const deltaViewModel: ScoreProgressionDeltaViewModel | null =
      effectiveChartType === "delta" && syncedScoreDelta != null
        ? {
            durationMs: viewData.durationMs,
            scoreDelta: syncedScoreDelta,
            team0Color: viewData.teamLines[0]?.color ?? TICK_FILL,
            team1Color: viewData.teamLines[1]?.color ?? TICK_FILL,
            playerAdvantage: effectivePlayerAdvantage,
            tooltipFormatter: (value: number | string | readonly (number | string)[] | undefined): [string, string] =>
              this.formatDeltaTooltip(value, team0Name, team1Name),
            advantageTooltipFormatter: (
              value: number | string | readonly (number | string)[] | undefined,
            ): [string, string] => this.formatAdvantageTooltip(value, team0Name, team1Name),
          }
        : null;

    const hasDelta = viewData.scoreDelta != null;
    const hasPlayerAdvantage = viewData.playerAdvantage != null;

    return {
      kind: "score-lines",
      ariaLabel,
      effectiveChartType,
      hasDelta,
      hasPlayerAdvantage,
      showPlayerAdvantage,
      showToolbar: hasDelta || hasPlayerAdvantage,
      deltaViewModel,
      progressionViewModel: {
        durationMs: viewData.durationMs,
        teamLines: viewData.teamLines,
        playerAdvantage: effectivePlayerAdvantage,
        tooltipFormatter: (
          value: number | string | readonly (number | string)[] | undefined,
          name: string | number | undefined,
        ): [string, string] => this.formatProgressionTooltip(value, name, team0Name, team1Name),
      },
      onChartTypeChange: this.onChartTypeChange,
      onPlayerAdvantageChange: this.onPlayerAdvantageChange,
    };
  }

  private presentTimelineGantt(
    ariaLabel: string,
    durationMs: number,
    rows: readonly TimelineGanttRowViewModel[],
  ): TimelineGanttChartViewModel {
    return {
      kind: "timeline-gantt",
      ariaLabel,
      timeline: {
        durationMs,
        rows: this.orderRowsForVerticalChart(rows),
      },
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

  private synchronizeDeltaDomain(scoreDelta: ScoreDeltaData, advantage: PlayerAdvantageData | null): ScoreDeltaData {
    if (advantage == null) {
      return scoreDelta;
    }
    const maxAbsDelta = Math.max(Math.abs(scoreDelta.minScore), Math.abs(scoreDelta.maxScore));
    return { ...scoreDelta, minScore: -maxAbsDelta, maxScore: maxAbsDelta };
  }

  private setChartType(value: string): void {
    if (value === "progression" || value === "delta") {
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
    if (name === "Player Advantage") {
      return this.formatAdvantageTooltip(value, team0Name, team1Name);
    }
    return [String(value ?? ""), typeof name === "string" ? name : String(name ?? "")];
  }

  private formatAdvantageTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    if (typeof value !== "number" || value === 0 || Number.isNaN(value)) {
      return ["Even", "Player Advantage"];
    }
    const leader = value > 0 ? team0Name : team1Name;
    return [`${leader} +${String(Math.abs(value))}`, "Player Advantage"];
  }

  private formatDeltaTooltip(
    value: number | string | readonly (number | string)[] | undefined,
    team0Name: string,
    team1Name: string,
  ): [string, string] {
    if (typeof value !== "number" || value === 0 || Number.isNaN(value)) {
      return ["Tied", DELTA_LABEL];
    }
    const leader = value > 0 ? team0Name : team1Name;
    return [`${leader} +${String(Math.abs(value))}`, DELTA_LABEL];
  }
}
