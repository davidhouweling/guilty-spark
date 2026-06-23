import type { ReactElement } from "react";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { DiscordSeriesStatsViewModel } from "./types";

export function DiscordSeriesStatsView(props: DiscordSeriesStatsViewModel): ReactElement {
  return <SharedSeriesStatsView {...props} />;
}
