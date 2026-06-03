import React from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { accentStyle } from "../accent-style";
import { gameModeIconSrc } from "../game-mode-icon";
import type { ViewerMatchTab, ViewerSeriesTab, ViewerTimelineItem } from "./types";
import styles from "./viewer-tabs.module.css";

interface MatchTabProps {
  readonly match: ViewerMatchTab;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function MatchTab({ match, selected, onSelect }: MatchTabProps): React.ReactElement {
  return (
    <button
      type="button"
      className={classNames(styles.tab, {
        [styles.tabAccented]: match.colorHex != null,
        [styles.tabSelected]: selected,
      })}
      style={accentStyle(match.colorHex)}
      title={`${match.mapName} ${match.score}`}
      onClick={onSelect}
    >
      <img className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
      <span className={styles.tabScore}>{match.score}</span>
    </button>
  );
}

interface SeriesTabProps {
  readonly series: ViewerSeriesTab;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function SeriesTab({ series, selected, onSelect }: SeriesTabProps): React.ReactElement {
  return (
    <button
      type="button"
      className={classNames(styles.tab, styles.tabSeries, { [styles.tabSelected]: selected })}
      title={`${series.title} ${series.score}`}
      onClick={onSelect}
    >
      <span className={styles.tabSeriesTitle}>{series.title}</span>
      <span className={styles.tabScore}>{series.score}</span>
      <div className={styles.tabIcons}>
        {series.matches.map((match) => (
          <img key={match.matchId} className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
        ))}
      </div>
    </button>
  );
}

interface TabsBarProps {
  readonly timeline: readonly ViewerTimelineItem[];
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

export function TabsBar({ timeline, selectedMatchId, onSelectMatch, onDeselect }: TabsBarProps): React.ReactElement {
  return (
    <div className={styles.tabBar}>
      {timeline.map((item) => {
        switch (item.type) {
          case "match": {
            const { matchId } = item.match;
            const isSelected = matchId === selectedMatchId;
            const handleMatchSelect = isSelected
              ? onDeselect
              : (): void => {
                  onSelectMatch(matchId);
                };
            return (
              <MatchTab
                key={item.match.matchId}
                match={item.match}
                selected={isSelected}
                onSelect={handleMatchSelect}
              />
            );
          }
          case "series": {
            const [firstMatch] = item.series.matches;
            if (item.series.matches.length === 0) {
              return null;
            }
            const isSelected = item.series.matches.some((m) => m.matchId === selectedMatchId);
            const handleSeriesSelect = isSelected
              ? onDeselect
              : (): void => {
                  onSelectMatch(firstMatch.matchId);
                };
            return (
              <SeriesTab
                key={item.series.id}
                series={item.series}
                selected={isSelected}
                onSelect={handleSeriesSelect}
              />
            );
          }
          default: {
            throw new UnreachableError(item);
          }
        }
      })}
    </div>
  );
}
