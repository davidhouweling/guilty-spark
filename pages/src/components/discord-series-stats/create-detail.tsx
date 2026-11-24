import { useMemo } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
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
      const presented = presenter.present(data, analyticsByMatchId, { teamColors: colorModel.teamColors });
      if (!colorModel.available) {
        return presented;
      }

      return {
        ...presented,
        teams: presented.teams.map((team, index) => {
          const nameOverride =
            index === 0
              ? seriesSettings.eagleTeamNameOverride
              : index === 1
                ? seriesSettings.cobraTeamNameOverride
                : null;
          return {
            ...team,
            name: nameOverride != null && nameOverride !== "" ? nameOverride : team.name,
          };
        }),
      };
    }, [
      analyticsByMatchId,
      colorModel,
      data,
      presenter,
      seriesSettings.cobraTeamNameOverride,
      seriesSettings.eagleTeamNameOverride,
    ]);

    return (
      <DiscordSeriesStatsView
        {...model}
        title={seriesSettings.titleOverride ?? model.title}
        subtitle={seriesSettings.subtitleOverride ?? model.subtitle}
        viewMode={viewMode}
        seriesSettings={seriesSettings}
        observerColors={observerColors}
        stableTeamSlotsAvailable={colorModel.available}
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
