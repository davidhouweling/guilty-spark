import { useMemo } from "react";
import type { ReactElement } from "react";
import { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import { SeriesDetailStatsViewModelPresenter } from "./series-detail-stats-view-model-presenter";
import { SeriesStatsView } from "./series-stats";
import type { SeriesStatsContentProps } from "./types";

export function createSeriesStatsContent(): (props: SeriesStatsContentProps) => ReactElement {
  function SeriesStatsContent({
    data,
    analyticsByMatchId,
    showSeriesTitle,
    showSeriesOverview,
    noGutter,
    wide,
    teamColors,
    onAnalyticsTabSelected,
  }: SeriesStatsContentProps): ReactElement {
    const statsDetailController = useMemo(() => new StatsDetailController(), []);
    const presenter = useMemo(
      () => new SeriesDetailStatsViewModelPresenter(statsDetailController),
      [statsDetailController],
    );
    const model = useMemo(
      () => presenter.present(data, analyticsByMatchId, { teamColors }),
      [analyticsByMatchId, data, presenter, teamColors],
    );

    return (
      <SeriesStatsView
        {...model}
        showSeriesTitle={showSeriesTitle}
        showSeriesOverview={showSeriesOverview}
        noGutter={noGutter}
        wide={wide}
        onAnalyticsTabSelected={onAnalyticsTabSelected}
      />
    );
  }

  return SeriesStatsContent;
}
