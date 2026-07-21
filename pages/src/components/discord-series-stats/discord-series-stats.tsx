import type { ReactElement } from "react";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";
import styles from "./discord-series-stats.module.css";

export function DiscordSeriesStatsView({ title, subtitle, ...stats }: DiscordSeriesStatsViewModel): ReactElement {
  return (
    <>
      <Container>
        <Heading tagName="h1">{title}</Heading>
        <p className={styles.subtitle}>{subtitle}</p>
      </Container>
      <div className={styles.content}>
        <SharedSeriesStatsView title={title} subtitle={subtitle} showSeriesTitle={true} {...stats} />
      </div>
    </>
  );
}
