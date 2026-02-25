// TODO: work out why the types aren't aligned
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import React, { useState, useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
import { CSSTransition } from "react-transition-group";
import type { MatchStatsData, MatchStatsValues } from "../stats/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { TeamColor } from "../team-colors/team-colors";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import {
  ViewModeSelector,
  type ViewMode,
  type PreviewMode,
  type StreamerOptions,
} from "../view-mode/view-mode-selector";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import type { LiveTrackerViewModel } from "./types";
import styles from "./streamer-overlay.module.css";

interface StreamerOverlayProps {
  readonly model: LiveTrackerViewModel;
  readonly teamColors: TeamColor[];
  readonly allMatchStats: { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly viewMode: ViewMode;
  readonly onViewModeSelect: (mode: ViewMode) => void;
  readonly previewMode: PreviewMode;
  readonly onPreviewModeSelect: (mode: PreviewMode) => void;
  readonly streamerOptions: StreamerOptions;
  readonly onStreamerOptionsChange: (options: StreamerOptions) => void;
}

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

type TabType = "series" | "match";

interface TabData {
  readonly type: TabType;
  readonly matchIndex?: number;
  readonly matchId?: string;
}

export function StreamerOverlay({
  model,
  teamColors,
  allMatchStats,
  seriesStats,
  gameModeIconUrl,
  viewMode,
  onViewModeSelect,
  previewMode,
  onPreviewModeSelect,
  streamerOptions,
  onStreamerOptionsChange,
}: StreamerOverlayProps): React.ReactElement {
  const [selectedTab, setSelectedTab] = useState<number>(-1); // -1 = series, 0+ = match index
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0); // Index of which match to show in ticker
  const [previousMatchCount, setPreviousMatchCount] = useState<number>(0);
  const nodeRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);

  if (!model.state) {
    return <div className={styles.overlay}>No data available</div>;
  }

  const { state } = model;

  // Generate ticker match groups with structured data for styling
  const tickerMatchGroups = useMemo((): TickerMatchGroup[] => {
    const groups: TickerMatchGroup[] = [];

    // Series stats first
    if (seriesStats && seriesStats.teamData.length > 0) {
      const rows: TickerStatRow[] = [];

      // Team stats
      for (const [idx, teamData] of seriesStats.teamData.entries()) {
        const teamName = state.teams[idx]?.name ?? `Team ${(idx + 1).toString()}`;
        rows.push({
          type: "team",
          teamId: idx,
          name: teamName,
          stats: teamData.teamStats,
          medals: teamData.teamMedals,
        });
      }

      // Player stats
      for (const teamData of seriesStats.playerData) {
        for (const player of teamData.players) {
          rows.push({
            type: "player",
            teamId: teamData.teamId,
            name: player.name,
            stats: player.values,
            medals: player.medals,
          });
        }
      }

      groups.push({ matchIndex: -1, label: "Series Stats", rows });
    }

    // Match stats
    for (const [matchIndex, matchStat] of allMatchStats.entries()) {
      if (matchStat.data) {
        const rows: TickerStatRow[] = [];

        // Team stats for this match
        for (const teamData of matchStat.data) {
          const teamName = state.teams[teamData.teamId]?.name ?? `Team ${(teamData.teamId + 1).toString()}`;
          rows.push({
            type: "team",
            teamId: teamData.teamId,
            name: teamName,
            stats: teamData.teamStats,
            medals: teamData.teamMedals,
          });
        }

        // Player stats for this match
        for (const teamData of matchStat.data) {
          for (const player of teamData.players) {
            rows.push({
              type: "player",
              teamId: teamData.teamId,
              name: player.name,
              stats: player.values,
              medals: player.medals,
            });
          }
        }

        const matchModel = state.matches[matchIndex];
        const label = matchModel.gameTypeAndMap;
        groups.push({ matchIndex, label, rows });
      }
    }

    return groups;
  }, [state, seriesStats, allMatchStats]);

  // Switch to next match when animation completes (only if ticker is enabled)
  useEffect(() => {
    if (!streamerOptions.showTicker) {
      return;
    }

    const tickerElement = tickerRef.current?.querySelector(`.${styles.tickerScroll}`) as HTMLElement | null;
    if (!tickerElement || tickerMatchGroups.length === 0) {
      return;
    }

    const handleAnimationEnd = (): void => {
      setCurrentMatchIndex((prev) => (prev + 1) % tickerMatchGroups.length);
    };

    tickerElement.addEventListener("animationend", handleAnimationEnd);

    return (): void => {
      tickerElement.removeEventListener("animationend", handleAnimationEnd);
    };
  }, [tickerMatchGroups.length, currentMatchIndex, streamerOptions.showTicker]);

  // When a new match is added, jump to it (only if ticker is enabled)
  useEffect(() => {
    if (!streamerOptions.showTicker) {
      return;
    }

    const currentMatchCount = allMatchStats.length;

    // Only jump to new match if count increased (not on first load)
    if (currentMatchCount > previousMatchCount && previousMatchCount > 0) {
      const latestMatchIndex = tickerMatchGroups.findIndex((group) => group.matchIndex === currentMatchCount - 1);
      if (latestMatchIndex !== -1) {
        setCurrentMatchIndex(latestMatchIndex);
      }
    }

    setPreviousMatchCount(currentMatchCount);
  }, [allMatchStats.length, tickerMatchGroups, previousMatchCount, streamerOptions.showTicker]);

  const handleTabClick = (tabIndex: number): void => {
    if (selectedTab === tabIndex) {
      setIsPanelOpen(!isPanelOpen);
    } else {
      setSelectedTab(tabIndex);
      setIsPanelOpen(true);
    }
  };

  const handleClosePanel = (): void => {
    setIsPanelOpen(false);
  };

  const currentMatchGroup = tickerMatchGroups[currentMatchIndex];
  const activeTabIndex = streamerOptions.showTicker ? currentMatchGroup?.matchIndex : undefined;

  // Build tabs array
  const tabs: (TabData & { label: string; score?: string; icon?: string; bgImage?: string; teamColor?: string })[] = [
    {
      type: "series",
      label: state.seriesScore.replaceAll(/(🦅|🐍)/g, "").trim(),
    },
    ...state.matches.map((match, idx) => {
      // Determine winning team for overlay color
      let winningTeamIndex: number | null = null;
      if (match.rawMatchStats) {
        const winningTeam = match.rawMatchStats.Teams.find((team) => team.Outcome === 2); // 2 = Win
        if (winningTeam) {
          winningTeamIndex = match.rawMatchStats.Teams.indexOf(winningTeam);
        }
      }

      const teamColor = winningTeamIndex !== null ? teamColors[winningTeamIndex]?.hex : undefined;

      return {
        type: "match" as const,
        matchIndex: idx,
        matchId: match.matchId,
        label: match.gameMap,
        score: match.gameScore,
        icon: gameModeIconUrl(match.gameType),
        bgImage: match.gameMapThumbnailUrl,
        teamColor,
      };
    }),
  ];

  return (
    <div className={classNames(styles.overlay, styles[`preview-${previewMode}`])}>
      {/* View Mode Selector */}
      <div className={styles.viewModeContainer}>
        <ViewModeSelector
          currentMode={viewMode}
          onModeSelect={onViewModeSelect}
          previewMode={previewMode}
          onPreviewModeSelect={onPreviewModeSelect}
          streamerOptions={streamerOptions}
          onStreamerOptionsChange={onStreamerOptionsChange}
        />
      </div>

      {/* Top Section: Teams and Score */}
      <div className={styles.topSection}>
        <div className={styles.queueInfo}>
          {streamerOptions.showServerName && (
            <>
              <div className={styles.serverName}>{state.guildName}</div>{" "}
              <div className={styles.queueNumber}>Queue #{state.queueNumber}</div>
            </>
          )}
          {/* Center Score */}
          <div className={styles.scoreDisplay}>
            <div className={styles.scoreText}>{state.seriesScore.replaceAll(/(🦅|🐍)/g, "").trim()}</div>
          </div>
        </div>

        {streamerOptions.showTeams && (
          <>
            <div className={styles.teamLeft} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
              <span className={styles.teamName}>{state.teams[0]?.name ?? "Team 1"}:</span>
              <span className={styles.teamPlayers}>
                {state.teams[0]?.players.map((p) => p.displayName).join(", ") ?? ""}
              </span>
            </div>
            <div className={styles.teamRight} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
              <span className={styles.teamName}>{state.teams[1]?.name ?? "Team 2"}:</span>
              <span className={styles.teamPlayers}>
                {state.teams[1]?.players.map((p) => p.displayName).join(", ") ?? ""}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bottom Section: Ticker and Tabs */}
      {(streamerOptions.showTabs || streamerOptions.showTicker) && (
        <div className={styles.bottomSection}>
          {streamerOptions.showTabs && (
            <div className={styles.tabBar}>
              {tabs.map((tab) => {
                const tabIndex = tab.type === "series" ? -1 : (tab.matchIndex ?? 0);
                const isActive = activeTabIndex === tabIndex;
                const isSelected = selectedTab === tabIndex;

                return (
                  <button
                    key={tab.type === "series" ? "series" : tab.matchId}
                    type="button"
                    className={classNames(styles.tab, {
                      [styles.tabActive]: isActive,
                      [styles.tabSelected]: isSelected,
                      [styles.tabSeries]: tab.type === "series",
                    })}
                    onClick={(): void => {
                      handleTabClick(tabIndex);
                    }}
                    style={
                      tab.bgImage != null && tab.teamColor != null
                        ? ({
                            "--tab-bg": `url(${tab.bgImage})`,
                            "--tab-team-color": tab.teamColor,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <div className={styles.tabContent}>
                      {tab.icon != null && <img src={tab.icon} alt="" className={styles.tabIcon} />}
                      <span className={styles.tabLabel}>{tab.label}</span>
                      {tab.score != null && <span className={styles.tabScore}>{tab.score}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {/* Information Ticker */}
          {streamerOptions.showTicker && currentMatchGroup != null && (
            <div className={styles.ticker} ref={tickerRef}>
              <div className={styles.tickerScroll} key={currentMatchIndex}>
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
          )}
        </div>
      )}

      {/* Sliding Stats Panel */}
      <CSSTransition
        in={isPanelOpen}
        timeout={300}
        classNames={{
          enter: styles.panelEnter,
          enterActive: styles.panelEnterActive,
          exit: styles.panelExit,
          exitActive: styles.panelExitActive,
        }}
        nodeRef={nodeRef}
        unmountOnExit
      >
        <div ref={nodeRef} className={styles.statsPanel} onClick={handleClosePanel}>
          <div
            className={styles.statsPanelContent}
            onClick={(e): void => {
              e.stopPropagation();
            }}
          >
            <button type="button" className={styles.closeButton} onClick={handleClosePanel}>
              ✕
            </button>
            {selectedTab === -1 && seriesStats ? (
              <SeriesStats
                teamData={seriesStats.teamData}
                playerData={seriesStats.playerData}
                title="Series Totals"
                metadata={seriesStats.metadata}
                teamColors={teamColors}
              />
            ) : null}
            {selectedTab >= 0 && allMatchStats[selectedTab]?.data ? (
              <MatchStatsView
                data={allMatchStats[selectedTab].data}
                id={state.matches[selectedTab].matchId}
                backgroundImageUrl={state.matches[selectedTab].gameMapThumbnailUrl}
                gameModeIconUrl={gameModeIconUrl(state.matches[selectedTab].gameType)}
                gameModeAlt={state.matches[selectedTab].gameType}
                matchNumber={selectedTab + 1}
                gameTypeAndMap={state.matches[selectedTab].gameTypeAndMap}
                duration={state.matches[selectedTab].duration}
                score={state.matches[selectedTab].gameScore}
                startTime={state.matches[selectedTab].startTime}
                endTime={state.matches[selectedTab].endTime}
                teamColors={teamColors}
              />
            ) : null}
          </div>
        </div>
      </CSSTransition>
    </div>
  );
}
