import type { ReactElement } from "react";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";

export function DiscordSeriesStatsView({ title, subtitle, ...stats }: DiscordSeriesStatsViewModel): ReactElement {
  return (
    <>
      <Container>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </Container>
      <SharedSeriesStatsView title={title} subtitle={subtitle} {...stats} />
    </>
  );
}
