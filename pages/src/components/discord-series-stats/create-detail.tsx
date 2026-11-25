import { useMemo } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import type { SeriesMatchAnalyticsById } from "../series-stats/types";
import { SeriesDetailStatsViewModelPresenter } from "../series-stats/series-detail-stats-view-model-presenter";
import type { ViewMode } from "../view-mode/view-mode-selector";
import type { ObserverViewColorSettings, SeriesStreamerSettings } from "../live-tracker/settings/types";
import { presentArchiveSeriesColors } from "./archive-series-colors";
import { DiscordSeriesStatsView } from "./discord-series-stats";

export interface DiscordSeriesDetailStatsProps {
  readonly data: SeriesDetailResponse;
  readonly analyticsByMatchId: SeriesMatchAnalyticsById;
  readonly viewMode: ViewMode;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly observerColors: ObserverViewColorSettings;
  readonly onObserverColorsChange: (updates: Partial<ObserverViewColorSettings>) => void;
  readonly onSeriesSettingsChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly onViewModeSelect: (mode: ViewMode) => void;
  readonly onAnalyticsTabSelected: (module: AnalyticsModule, matchId?: string) => void;
}

export function createDiscordSeriesDetailStats(): (props: DiscordSeriesDetailStatsProps) => ReactElement {
  function DiscordSeriesDetailStats({
    data,
    analyticsByMatchId,
    viewMode,
    seriesSettings,
    observerColors,
    onObserverColorsChange,
    onSeriesSettingsChange,
    onViewModeSelect,
    onAnalyticsTabSelected,
  }: DiscordSeriesDetailStatsProps): ReactElement {
    const statsDetailController = useMemo(() => new StatsDetailController(), []);
    const presenter = useMemo(
      () => new SeriesDetailStatsViewModelPresenter(statsDetailController),
      [statsDetailController],
    );
    const colorModel = useMemo(() => presentArchiveSeriesColors(data, observerColors), [data, observerColors]);
    const model = useMemo(() => {
      return presenter.present(data, analyticsByMatchId, {
        teamColors: colorModel.teamColors,
        teamNameOverrides: colorModel.available
          ? [seriesSettings.eagleTeamNameOverride, seriesSettings.cobraTeamNameOverride]
          : [],
      });
    }, [
      analyticsByMatchId,
      colorModel,
      data,
      presenter,
      seriesSettings.cobraTeamNameOverride,
      seriesSettings.eagleTeamNameOverride,
    ]);
    const colorLabels = colorModel.available
      ? {
          first: `${Preconditions.checkExists(model.teams[0], "First series team is missing").name} team color`,
          second: `${Preconditions.checkExists(model.teams[1], "Second series team is missing").name} team color`,
        }
      : null;

    return (
      <DiscordSeriesStatsView
        {...model}
        title={seriesSettings.titleOverride ?? model.title}
        subtitle={seriesSettings.subtitleOverride ?? model.subtitle}
        viewMode={viewMode}
        seriesSettings={seriesSettings}
        observerColors={observerColors}
        colorLabels={colorLabels}
        onObserverColorsChange={onObserverColorsChange}
        defaultTitle={data.context?.title ?? null}
        defaultSubtitle={data.context?.subtitle ?? null}
        onSeriesSettingsChange={onSeriesSettingsChange}
        onViewModeSelect={onViewModeSelect}
        onAnalyticsTabSelected={onAnalyticsTabSelected}
      />
    );
  }

  return DiscordSeriesDetailStats;
}
