import { useMemo } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import type { SeriesMatchAnalyticsById } from "../series-stats/types";
import { SeriesDetailStatsViewModelPresenter } from "../series-stats/series-detail-stats-view-model-presenter";
import type { ViewMode } from "../view-mode/view-mode-selector";
import type { SeriesStreamerSettings } from "../live-tracker/settings/types";
import { DiscordSeriesStatsView } from "./discord-series-stats";

export interface DiscordSeriesDetailStatsProps {
  readonly data: SeriesDetailResponse;
  readonly analyticsByMatchId: SeriesMatchAnalyticsById;
  readonly viewMode: ViewMode;
  readonly seriesSettings: SeriesStreamerSettings;
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
    onSeriesSettingsChange,
    onViewModeSelect,
    onAnalyticsTabSelected,
  }: DiscordSeriesDetailStatsProps): ReactElement {
    const statsDetailController = useMemo(() => new StatsDetailController(), []);
    const presenter = useMemo(
      () => new SeriesDetailStatsViewModelPresenter(statsDetailController),
      [statsDetailController],
    );
    const model = useMemo(() => presenter.present(data, analyticsByMatchId), [analyticsByMatchId, data, presenter]);

    return (
      <DiscordSeriesStatsView
        {...model}
        title={seriesSettings.titleOverride ?? model.title}
        subtitle={seriesSettings.subtitleOverride ?? model.subtitle}
        viewMode={viewMode}
        seriesSettings={seriesSettings}
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
