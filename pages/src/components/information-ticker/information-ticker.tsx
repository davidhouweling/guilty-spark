import React, { useEffect } from "react";
import classNames from "classnames";
import type { MatchStatsValues } from "../stats/types";
import type { TeamColor } from "../team-colors/team-colors";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import { PlayerName } from "../player-name/player-name";
import { ScrollingContent } from "../scrolling-content/scrolling-content";
import styles from "./information-ticker.module.css";

interface TickerStatRow {
  readonly type: "team" | "player";
  readonly teamId: number;
  readonly name: string;
  readonly discordName?: string | null;
  readonly gamertag?: string | null;
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
  readonly onScrollComplete: () => void;
}

export function InformationTicker({
  currentMatchGroup,
  teamColors,
  onScrollComplete,
}: InformationTickerProps): React.ReactElement {
  const [currentRowIndex, setCurrentRowIndex] = React.useState<number>(0);

  // Reset to first row when match group changes
  useEffect(() => {
    setCurrentRowIndex(0);
  }, [currentMatchGroup]);

  const handleRowScrollComplete = (): void => {
    // Move to next row or complete the cycle
    if (currentRowIndex < currentMatchGroup.rows.length - 1) {
      setCurrentRowIndex(currentRowIndex + 1);
    } else {
      // All rows complete, notify parent
      setCurrentRowIndex(0);
      onScrollComplete();
    }
  };

  const currentRow = currentMatchGroup.rows[currentRowIndex];
  const teamColor = teamColors[currentRow.teamId];

  return (
    <div className={styles.ticker}>
      <div className={styles.tickerContent}>
        {/* Pinned Section: "label | team icon + name" */}
        <div
          className={classNames(styles.tickerPinned, {
            [styles.tickerTeamRow]: currentRow.type === "team",
            [styles.tickerPlayerRow]: currentRow.type === "player",
          })}
          style={
            {
              "--row-color": teamColor.hex,
            } as React.CSSProperties
          }
        >
          {/* Label */}
          <span className={styles.tickerLabel}>{currentMatchGroup.label}</span>

          {/* Separator */}
          <span className={styles.tickerSeparator}>|</span>

          {/* Team Icon + Name */}
          <div className={styles.tickerName}>
            <TeamIcon teamId={currentRow.teamId} size="small" />
            {currentRow.type === "player" && (currentRow.discordName != null || currentRow.gamertag != null) ? (
              <PlayerName
                discordName={currentRow.discordName ?? null}
                gamertag={currentRow.gamertag ?? null}
                showIcons={false}
              />
            ) : (
              <span>{currentRow.name}</span>
            )}
          </div>
        </div>

        {/* Scrolling Section: Stats + Medals */}
        <div className={styles.tickerScrolling}>
          <ScrollingContent maxWidth={600} loop={false} onScrollComplete={handleRowScrollComplete}>
            <div
              className={classNames(styles.tickerRow, styles.tickerScrollingRow, {
                [styles.tickerTeamRow]: currentRow.type === "team",
                [styles.tickerPlayerRow]: currentRow.type === "player",
              })}
              style={
                {
                  "--row-color": teamColor.hex,
                } as React.CSSProperties
              }
            >
              <div className={styles.tickerStats}>
                {currentRow.stats.map((stat, statIdx) => (
                  <span key={statIdx} className={styles.tickerStat}>
                    <span className={styles.tickerStatName}>{stat.name}:</span>
                    {stat.icon}
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
              {currentRow.medals.length > 0 && (
                <div className={styles.tickerMedals}>
                  {currentRow.medals.map((medal, medalIdx) => (
                    <span key={medalIdx} className={styles.tickerMedal}>
                      {medal.count > 1 && <span className={styles.tickerMedalCount}>{medal.count}×</span>}
                      <MedalIcon medalName={medal.name} size="small" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </ScrollingContent>
        </div>
      </div>
    </div>
  );
}

export type { TickerStatRow, TickerMatchGroup };
