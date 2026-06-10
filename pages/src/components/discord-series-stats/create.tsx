import { useMemo, type ReactElement } from "react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsView } from "./discord-series-stats-view";

interface DiscordSeriesStatsProps {
  readonly data: DiscordSeriesStatsResolved;
}

export function DiscordSeriesStats({ data }: DiscordSeriesStatsProps): ReactElement {
  const presenter = useMemo(() => new DiscordSeriesStatsPresenter(data.renderData), [data]);

  const model = useMemo(() => presenter.present(), [presenter]);

  return <DiscordSeriesStatsView renderData={data.renderData} model={model} />;
}
