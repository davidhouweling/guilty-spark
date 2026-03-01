import React, { useEffect, useRef } from "react";
import classNames from "classnames";
import type { MatchStatsValues } from "../stats/types";
import type { TeamColor } from "../team-colors/team-colors";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import styles from "./information-ticker.module.css";

interface TickerStatRow {
  readonly type: "team" | "player";
  readonly teamId: number;
  readonly name: string;
  readonly stats: MatchStatsValues[];
  readonly medals: { name: string; count: number }[];
}

interface TickerMatchGroup {
  readonly matchIndex: number; // -1 for series
  readonly label: string;
  readonly rows: TickerStatRow[];
}

interface InformationTickerProps {
  readonly currentMatchGroup: TickerMatchGroup;
  readonly teamColors: TeamColor[];
  readonly tickerRef: React.RefObject<HTMLDivElement | null>;
  readonly currentMatchIndex: number;
}

export function InformationTicker({
  currentMatchGroup,
  teamColors,
  tickerRef,
  currentMatchIndex,
}: InformationTickerProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tickerDuration, setTickerDuration] = React.useState<number>(60);

  // Calculate animation duration based on content width
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement == null) {
      return;
    }

    const calculateDuration = (): void => {
      // Use double requestAnimationFrame to ensure layout is complete after content change
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const { scrollWidth } = scrollElement;
          const viewportWidth = window.innerWidth;

          // Total distance: viewport width (enter) + content width + viewport width (exit)
          const totalDistance = viewportWidth + scrollWidth + viewportWidth;

          // Pixels per second for smooth, readable scrolling
          const pixelsPerSecond = 50;
          const duration = totalDistance / pixelsPerSecond;

          setTickerDuration(duration);
        });
      });
    };

    calculateDuration();

    window.addEventListener("resize", calculateDuration);
    return (): void => {
      window.removeEventListener("resize", calculateDuration);
    };
  }, [currentMatchIndex, currentMatchGroup]);

  return (
    <div className={styles.ticker} ref={tickerRef}>
      <div
        ref={scrollRef}
        className={styles.tickerScroll}
        key={currentMatchIndex}
        style={{ "--ticker-duration": `${tickerDuration.toString()}s` } as React.CSSProperties}
      >
        {/* Ticker Label */}
        <div className={styles.tickerLabel}>
          <span className={styles.tickerLabelText}>{currentMatchGroup.label}</span>
        </div>
        {currentMatchGroup.rows.map((row, rowIdx) => {
          const teamColor = teamColors[row.teamId];
          return (
            <div
              key={rowIdx}
              className={classNames(styles.tickerRow, {
                [styles.tickerTeamRow]: row.type === "team",
                [styles.tickerPlayerRow]: row.type === "player",
              })}
              style={
                {
                  "--row-color": teamColor.hex,
                } as React.CSSProperties
              }
            >
              <div className={styles.tickerRowContent}>
                <div className={styles.tickerName}>
                  <TeamIcon teamId={row.teamId} size="small" />
                  <span>{row.name}</span>
                </div>
                <div className={styles.tickerStats}>
                  {row.stats.map((stat, statIdx) => (
                    <span key={statIdx} className={styles.tickerStat}>
                      <span className={styles.tickerStatName}>{stat.name}:</span>
                      <span
                        className={classNames(styles.tickerStatValue, {
                          [styles.bestInTeam]: stat.bestInTeam,
                          [styles.bestInMatch]: stat.bestInMatch,
                        })}
                      >
                        {stat.display}
                      </span>
                    </span>
                  ))}
                </div>
                {row.medals.length > 0 && (
                  <div className={styles.tickerMedals}>
                    {row.medals.map((medal, medalIdx) => (
                      <span key={medalIdx} className={styles.tickerMedal}>
                        {medal.count > 1 && <span className={styles.tickerMedalCount}>{medal.count}×</span>}
                        <MedalIcon medalName={medal.name} size="small" />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { TickerStatRow, TickerMatchGroup };
