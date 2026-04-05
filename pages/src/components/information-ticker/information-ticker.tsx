import React, { useEffect, memo } from "react";
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

const InformationTickerComponent = function InformationTicker({
  currentMatchGroup,
  teamColors,
  onScrollComplete,
}: InformationTickerProps): React.ReactElement {
  const [currentRowIndex, setCurrentRowIndex] = React.useState(0);

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
    <div
      className={styles.ticker}
      style={
        {
          "--row-color": teamColor.hex,
        } as React.CSSProperties
      }
    >
      <div className={styles.tickerContent}>
        {/* Pinned Section: "label | team icon + name" */}
        <div
          className={classNames(styles.tickerPinned, {
            [styles.tickerTeamRow]: currentRow.type === "team",
            [styles.tickerPlayerRow]: currentRow.type === "player",
          })}
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
          <ScrollingContent maxWidth={600} loop={false} mode="ticker" onScrollComplete={handleRowScrollComplete}>
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
};

// Custom comparison function to prevent re-renders when content hasn't actually changed
function arePropsEqual(prevProps: InformationTickerProps, nextProps: InformationTickerProps): boolean {
  // Check team colors first - a color change always requires a re-render
  if (prevProps.teamColors.length !== nextProps.teamColors.length) {
    return false;
  }

  for (const [i, color] of prevProps.teamColors.entries()) {
    if (color?.hex !== nextProps.teamColors[i]?.hex) {
      return false;
    }
  }

  // If match group reference is the same and colors haven't changed, no need to re-render
  if (prevProps.currentMatchGroup === nextProps.currentMatchGroup) {
    return true;
  }

  const prev = prevProps.currentMatchGroup;
  const next = nextProps.currentMatchGroup;

  // Check if match group structure has changed
  if (prev.matchIndex !== next.matchIndex || prev.label !== next.label || prev.rows.length !== next.rows.length) {
    return false;
  }

  // Shallow check rows - compare key properties
  for (let i = 0; i < prev.rows.length; i++) {
    const prevRow = prev.rows[i];
    const nextRow = next.rows[i];

    if (
      prevRow.type !== nextRow.type ||
      prevRow.teamId !== nextRow.teamId ||
      prevRow.name !== nextRow.name ||
      prevRow.stats.length !== nextRow.stats.length ||
      prevRow.medals.length !== nextRow.medals.length
    ) {
      return false;
    }

    // Check stats values
    for (let j = 0; j < prevRow.stats.length; j++) {
      const prevStat = prevRow.stats[j];
      const nextStat = nextRow.stats[j];

      if (
        prevStat.name !== nextStat.name ||
        prevStat.value !== nextStat.value ||
        prevStat.display !== nextStat.display ||
        prevStat.bestInTeam !== nextStat.bestInTeam ||
        prevStat.bestInMatch !== nextStat.bestInMatch
      ) {
        return false;
      }
    }

    // Check medals
    for (let j = 0; j < prevRow.medals.length; j++) {
      const prevMedal = prevRow.medals[j];
      const nextMedal = nextRow.medals[j];

      if (prevMedal.name !== nextMedal.name || prevMedal.count !== nextMedal.count) {
        return false;
      }
    }
  }

  // All checks passed - props are equal
  return true;
}

export const InformationTicker = memo(InformationTickerComponent, arePropsEqual);

export type { TickerStatRow, TickerMatchGroup };
