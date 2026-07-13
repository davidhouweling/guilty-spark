import { useEffect, useMemo, useSyncExternalStore, type ReactElement } from "react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { StatsController } from "../../controllers/stats/stats-controller";
import { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsView } from "./discord-series-stats";

export interface CreateDiscordSeriesStatsConfig {
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export interface DiscordSeriesStatsProps {
  readonly data: DiscordSeriesStatsResolved;
}

interface DiscordSeriesStatsInternalProps extends DiscordSeriesStatsProps {
  readonly config: CreateDiscordSeriesStatsConfig;
}

function DiscordSeriesStatsInternal({ data, config }: DiscordSeriesStatsInternalProps): ReactElement {
  const { matchAnalyticsService, medalMetadataResolver } = config;
  const store = useMemo(() => new DiscordSeriesStatsStore(), [data.renderData]);
  const controller = useMemo(() => new StatsController(), [data.renderData]);
  const presenter = useMemo(
    () =>
      new DiscordSeriesStatsPresenter(data.renderData, controller, store, matchAnalyticsService, medalMetadataResolver),
    [data.renderData, controller, store, matchAnalyticsService, medalMetadataResolver],
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

  return <DiscordSeriesStatsView {...model} />;
}

export function createDiscordSeriesStats(
  config: CreateDiscordSeriesStatsConfig,
): (props: DiscordSeriesStatsProps) => ReactElement {
  const Component = (props: DiscordSeriesStatsProps): ReactElement => (
    <DiscordSeriesStatsInternal {...props} config={config} />
  );

  return Component;
}
