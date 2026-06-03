import React from "react";
import classNames from "classnames";
import { formatDistanceToNow, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { accentStyle } from "../accent-style";
import { gameModeIconSrc } from "../game-mode-icon";
import type { ViewerMatchTab, ViewerSeriesTab, ViewerTimelineItem } from "../viewer/types";
import styles from "./timeline.module.css";

export function relativeTime(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : "unknown";
}

function MatchCard({ match }: { readonly match: ViewerMatchTab }): React.ReactElement {
  return (
    <div
      className={classNames(styles.matchCard, { [styles.matchCardAccented]: match.colorHex != null })}
      style={accentStyle(match.colorHex)}
      data-testid="match-card"
    >
      <img className={styles.matchIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
      <div className={styles.matchBody}>
        <span className={styles.matchMap}>{match.mapName}</span>
        <span className={styles.matchMeta}>{relativeTime(match.startTime)}</span>
      </div>
      <span className={styles.matchScore}>{match.score}</span>
    </div>
  );
}

function SeriesCard({ series }: { readonly series: ViewerSeriesTab }): React.ReactElement {
  return (
    <div className={styles.seriesCard} data-testid="series-card">
      <div className={styles.seriesHeader}>
        <div className={styles.seriesTitleRow}>
          <span className={styles.seriesTitle}>{series.title}</span>
          <span className={styles.seriesSubtitle}>{series.subtitle}</span>
        </div>
        <span className={styles.seriesScore}>{series.score}</span>
      </div>
      <div className={styles.seriesMatches}>
        {series.matches.map((match) => (
          <MatchCard key={match.matchId} match={match} />
        ))}
      </div>
    </div>
  );
}

export function Timeline({ timeline }: { readonly timeline: readonly ViewerTimelineItem[] }): React.ReactElement {
  if (timeline.length === 0) {
    return <Alert variant="info">No matches tracked yet.</Alert>;
  }

  return (
    <section className={styles.timelineSection}>
      <div className={styles.timeline}>
        {timeline.map((item) => {
          switch (item.type) {
            case "match": {
              return <MatchCard key={item.match.matchId} match={item.match} />;
            }
            case "series": {
              return <SeriesCard key={item.series.id} series={item.series} />;
            }
            default: {
              throw new UnreachableError(item);
            }
          }
        })}
      </div>
    </section>
  );
}
