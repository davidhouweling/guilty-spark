import { TICK_FILL } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreProgressionDeltaViewModel,
  ScoreProgressionTeamLine,
  ScoreProgressionViewModel,
} from "./types";

export interface ScoreProgressionPresenterConfig {
  readonly store: ScoreProgressionStore;
}

export interface ScoreProgressionInput {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
  readonly playerAdvantage: PlayerAdvantageData | null;
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
    const { chartType, showPlayerAdvantage } = snapshot;
    const effectiveChartType: ChartType = chartType === "delta" && input.scoreDelta == null ? "progression" : chartType;
    const effectivePlayerAdvantage = showPlayerAdvantage ? input.playerAdvantage : null;

    const team0Name = input.teamLines[0]?.name ?? "Team 1";
    const team1Name = input.teamLines[1]?.name ?? "Team 2";

    const syncedScoreDelta =
      input.scoreDelta != null ? this.synchronizeDeltaDomain(input.scoreDelta, effectivePlayerAdvantage) : null;

    const deltaViewModel: ScoreProgressionDeltaViewModel | null =
      effectiveChartType === "delta" && syncedScoreDelta != null
        ? {
            durationMs: input.durationMs,
            scoreDelta: syncedScoreDelta,
            team0Color: input.teamLines[0]?.color ?? TICK_FILL,
            team1Color: input.teamLines[1]?.color ?? TICK_FILL,
            playerAdvantage: effectivePlayerAdvantage,
            tooltipFormatter: (value: number | string | readonly (number | string)[] | undefined): [string, string] =>
              this.formatDeltaTooltip(value, team0Name, team1Name),
          }
        : null;

    const hasDelta = input.scoreDelta != null;
    const hasPlayerAdvantage = input.playerAdvantage != null;

    return {
      ariaLabel: input.ariaLabel,
      effectiveChartType,
      hasDelta,
      hasPlayerAdvantage,
      showPlayerAdvantage,
      showToolbar: hasDelta || hasPlayerAdvantage,
      deltaViewModel,
      progressionViewModel: {
        durationMs: input.durationMs,
        teamLines: input.teamLines,
        playerAdvantage: effectivePlayerAdvantage,
      },
      onChartTypeChange: this.onChartTypeChange,
      onPlayerAdvantageChange: this.onPlayerAdvantageChange,
    };
  }

  private synchronizeDeltaDomain(scoreDelta: ScoreDeltaData, advantage: PlayerAdvantageData | null): ScoreDeltaData {
    if (advantage == null) {
      return scoreDelta;
    }
    const maxAbsDelta = Math.max(Math.abs(scoreDelta.minScore), Math.abs(scoreDelta.maxScore));
    return { ...scoreDelta, minScore: -maxAbsDelta, maxScore: maxAbsDelta, zeroFraction: 0.5 };
  }

  private setChartType(value: string): void {
    if (value === "progression" || value === "delta") {
      this.config.store.update({ chartType: value });
    }
  }

  private setPlayerAdvantage(checked: boolean): void {
    this.config.store.update({ showPlayerAdvantage: checked });
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
