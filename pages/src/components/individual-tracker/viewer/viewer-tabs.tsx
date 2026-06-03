import React from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { accentStyle } from "../accent-style";
import { gameModeIconSrc } from "../game-mode-icon";
import type { ViewerMatchTab, ViewerSeriesTab, ViewerTimelineItem } from "./types";
import styles from "./viewer-tabs.module.css";

function MatchTab({ match }: { readonly match: ViewerMatchTab }): React.ReactElement {
  return (
    <div
      className={classNames(styles.tab, { [styles.tabAccented]: match.colorHex != null })}
      style={accentStyle(match.colorHex)}
      title={`${match.mapName} ${match.score}`}
    >
      <img className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
      <span className={styles.tabScore}>{match.score}</span>
    </div>
  );
}

function SeriesTab({ series }: { readonly series: ViewerSeriesTab }): React.ReactElement {
  return (
    <div className={classNames(styles.tab, styles.tabSeries)} title={`${series.title} ${series.score}`}>
      <span className={styles.tabSeriesTitle}>{series.title}</span>
      <span className={styles.tabScore}>{series.score}</span>
      <div className={styles.tabIcons}>
        {series.matches.map((match) => (
          <img key={match.matchId} className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
        ))}
      </div>
    </div>
  );
}

export function TabsBar({ timeline }: { readonly timeline: readonly ViewerTimelineItem[] }): React.ReactElement {
  return (
    <div className={styles.tabBar}>
      {timeline.map((item) => {
        switch (item.type) {
          case "match": {
            return <MatchTab key={item.match.matchId} match={item.match} />;
          }
          case "series": {
            return <SeriesTab key={item.series.id} series={item.series} />;
          }
          default: {
            throw new UnreachableError(item);
          }
        }
      })}
    </div>
  );
}
