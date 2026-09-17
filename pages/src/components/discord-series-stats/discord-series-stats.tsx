import type { ReactElement } from "react";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";
import styles from "./discord-series-stats.module.css";

function emojifySeriesScore(seriesScore: string): string {
  const teamScores = seriesScore.split(":").map((score) => score.trim());
  if (teamScores.length !== 2) {
    return seriesScore;
  }

  return `🦅${teamScores[0]}:${teamScores[1]}🐍`;
}

function getQueueTitle(title: string): string {
  const queueMatch = /^Queue #(\d+)/.exec(title);
  return queueMatch?.[1] != null ? `Queue #${queueMatch[1]}` : title;
}

export function DiscordSeriesStatsView({ title, subtitle, ...stats }: DiscordSeriesStatsViewModel): ReactElement {
  const documentTitle = `${getQueueTitle(title)} (${emojifySeriesScore(stats.seriesScore)}) | ${subtitle} Stats - Guilty Spark`;

  return (
    <>
      <title>{documentTitle}</title>
      <Container className={styles.pageHeader}>
        <Heading tagName="h1" styleAs="h3">
          {title}
        </Heading>
        <p className={styles.subtitle}>{subtitle}</p>
      </Container>
      <div className={styles.content}>
        <SharedSeriesStatsView title={title} subtitle={subtitle} showSeriesTitle={true} {...stats} />
      </div>
    </>
  );
}
