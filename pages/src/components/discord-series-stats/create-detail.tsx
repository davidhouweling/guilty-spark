import { useMemo } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesMatchAnalyticsById } from "../series-stats/types";
import { SeriesDetailStatsViewModelPresenter } from "../series-stats/series-detail-stats-view-model-presenter";
import { DiscordSeriesStatsView } from "./discord-series-stats";

export interface DiscordSeriesDetailStatsProps {
  readonly data: SeriesDetailResponse;
  readonly analyticsByMatchId: SeriesMatchAnalyticsById;
  readonly onAnalyticsTabSelected: (module: AnalyticsModule, matchId?: string) => void;
}

export function createDiscordSeriesDetailStats(): (
  props: DiscordSeriesDetailStatsProps,
) => ReactElement {
  function DiscordSeriesDetailStats({
    data,
    analyticsByMatchId,
    onAnalyticsTabSelected,
  }: DiscordSeriesDetailStatsProps): ReactElement {
    const presenter = useMemo(() => new SeriesDetailStatsViewModelPresenter(), []);
    const model = useMemo(
      () => presenter.present(data, analyticsByMatchId),
      [analyticsByMatchId, data, presenter],
    );

    return <DiscordSeriesStatsView {...model} onAnalyticsTabSelected={onAnalyticsTabSelected} />;
  }

  return DiscordSeriesDetailStats;
}
