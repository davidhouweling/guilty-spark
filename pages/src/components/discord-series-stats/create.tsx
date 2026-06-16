import { useEffect, useMemo, useSyncExternalStore, type ReactElement } from "react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { StatsController } from "../../controllers/stats/stats-controller";
import { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsView } from "./discord-series-stats-view";

interface DiscordSeriesStatsProps {
  readonly data: DiscordSeriesStatsResolved;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

export function DiscordSeriesStats({ data, matchAnalyticsService }: DiscordSeriesStatsProps): ReactElement {
  const store = useMemo(() => new DiscordSeriesStatsStore(), [data.renderData]);
  const controller = useMemo(() => new StatsController(), [data.renderData]);
  const presenter = useMemo(
    () => new DiscordSeriesStatsPresenter(data.renderData, controller, store, matchAnalyticsService),
    [data.renderData, controller, store, matchAnalyticsService],
  );

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  useEffect(() => {
    presenter.start();
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const model = useMemo(() => presenter.present(snapshot), [presenter, snapshot]);

  return <DiscordSeriesStatsView renderData={data.renderData} model={model} />;
}
