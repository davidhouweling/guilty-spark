import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { TICK_FILL } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
  KothHillData,
  KothTimelineHillViewModel,
  KothViewData,
  KothViewModel,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreLinesViewData,
  ScoreLinesViewModel,
  ScoreProgressionDeltaViewModel,
  ScoreProgressionViewData,
  ScoreProgressionViewModel,
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
        return this.presentKoth(viewData, ariaLabel);
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

  private presentKoth(viewData: KothViewData, ariaLabel: string): KothViewModel {
    return {
      kind: "koth",
      ariaLabel,
      kothTimelineViewModel: {
        durationMs: viewData.durationMs,
        hills: this.buildKothTimelineHills(viewData.hills),
      },
    };
  }

  // Recharts vertical BarChart renders rows top-down, so hill 1 must be last to sit at the bottom
  private buildKothTimelineHills(hills: readonly KothHillData[]): KothTimelineHillViewModel[] {
    return hills
      .map((hill) => ({
        ...hill,
        captureProgressLabel: hill.teamCaptureProgress.map((o) => `${o.name} ${String(o.percentage)}%`).join(" · "),
      }))
      .reverse();
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
