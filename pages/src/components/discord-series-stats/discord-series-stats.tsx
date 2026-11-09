import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";
import styles from "./discord-series-stats.module.css";

interface DiscordSeriesStatsViewProps extends DiscordSeriesStatsViewModel {
  readonly onAnalyticsTabSelected?: ((module: AnalyticsModule, matchId?: string) => void) | undefined;
}

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

export function DiscordSeriesStatsView({
  title,
  subtitle,
  onAnalyticsTabSelected,
  ...stats
}: DiscordSeriesStatsViewProps): ReactElement {
  const documentTitle = `${getQueueTitle(title)} (${emojifySeriesScore(stats.seriesScore)}) | ${subtitle} Stats - Guilty Spark`;

  return (
    <>
      <title>{documentTitle}</title>
      <Container wide className={styles.pageHeader}>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <Heading tagName="h1" styleAs="h3">
              {title}
            </Heading>
            <div className={styles.headerSubtitle}>{subtitle}</div>
          </div>
        </div>
      </Container>
      <div className={styles.content}>
        <SharedSeriesStatsView
          title={title}
          subtitle={subtitle}
          showSeriesTitle={true}
          wide={true}
          onAnalyticsTabSelected={onAnalyticsTabSelected}
          {...stats}
        />
      </div>
    </>
  );
}
