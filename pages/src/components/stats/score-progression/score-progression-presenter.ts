import { TICK_FILL } from "./chart-constants";
import type { ScoreProgressionSnapshot, ScoreProgressionStore } from "./score-progression-store";
import type {
  ChartType,
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
  readonly ariaLabel: string;
}

const DELTA_LABEL = "Score Delta";

function formatDeltaTooltip(value: unknown, team0Name: string, team1Name: string): [string, string] {
  if (typeof value !== "number" || value === 0) {
    return ["Tied", DELTA_LABEL];
  }
  const leader = value > 0 ? team0Name : team1Name;
  return [`${leader} +${String(Math.abs(value))}`, DELTA_LABEL];
}

export class ScoreProgressionPresenter {
  constructor(private readonly config: ScoreProgressionPresenterConfig) {}

  setChartType(value: string): void {
    if (value === "progression" || value === "delta") {
      this.config.store.update({ chartType: value });
    }
  }

  present(snapshot: ScoreProgressionSnapshot, input: ScoreProgressionInput): ScoreProgressionViewModel {
    const { chartType } = snapshot;
    const effectiveChartType: ChartType =
      chartType === "delta" && input.scoreDelta == null ? "progression" : chartType;

    const team0Name = input.teamLines[0]?.name ?? "Team 1";
    const team1Name = input.teamLines[1]?.name ?? "Team 2";

    const deltaViewModel: ScoreProgressionDeltaViewModel | null =
      effectiveChartType === "delta" && input.scoreDelta != null
        ? {
            durationMs: input.durationMs,
            scoreDelta: input.scoreDelta,
            team0Color: input.teamLines[0]?.color ?? TICK_FILL,
            team1Color: input.teamLines[1]?.color ?? TICK_FILL,
            tooltipFormatter: (value: unknown): [string, string] =>
              formatDeltaTooltip(value, team0Name, team1Name),
          }
        : null;

    return {
      ariaLabel: input.ariaLabel,
      effectiveChartType,
      hasDelta: input.scoreDelta != null,
      onChartTypeChange: (value: string): void => {
        this.setChartType(value);
      },
      deltaViewModel,
      progressionViewModel: {
        durationMs: input.durationMs,
        teamLines: input.teamLines,
      },
    };
  }
}
