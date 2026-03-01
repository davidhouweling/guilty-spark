// TODO: work out why the types aren't aligned
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import React, { useState, useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
import { CSSTransition } from "react-transition-group";
import type { MatchStatsData } from "../stats/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { TeamColor } from "../team-colors/team-colors";
import {
  ViewModeSelector,
  type ViewMode,
  type PreviewMode,
  type StreamerOptions,
} from "../view-mode/view-mode-selector";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { InformationTicker, type TickerMatchGroup, type TickerStatRow } from "../information-ticker/information-ticker";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
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

    // Pre-series player info (when no matches yet but have player association data)
    if (state.matches.length === 0 && state.playersAssociationData) {
      const rows: TickerStatRow[] = [];

      // Build ticker rows for each player with their rank/ESRA data
      for (const [teamIndex, team] of state.teams.entries()) {
        for (const player of team.players) {
          const playerData = state.playersAssociationData[player.id];
          if (playerData == null) {
            continue;
          }

          const stats: { name: string; value: number; bestInTeam: boolean; bestInMatch: boolean; display: string }[] =
            [];

          // Current Rank
          if (playerData.currentRank !== null && playerData.currentRank >= 0) {
            stats.push({
              name: "Rank",
              value: playerData.currentRank,
              bestInTeam: false,
              bestInMatch: false,
              display: playerData.currentRank.toLocaleString(),
            });
          }

          // Peak Rank
          if (playerData.allTimePeakRank !== null && playerData.allTimePeakRank >= 0) {
            stats.push({
              name: "Peak",
              value: playerData.allTimePeakRank,
              bestInTeam: false,
              bestInMatch: false,
              display: playerData.allTimePeakRank.toLocaleString(),
            });
          }

          // ESRA
          if (playerData.esra !== null && playerData.esra >= 0) {
            stats.push({
              name: "ESRA",
              value: playerData.esra,
              bestInTeam: false,
              bestInMatch: false,
              display: Math.round(playerData.esra).toLocaleString(),
            });
          }

          // Last Match (as time ago)
          if (playerData.lastRankedGamePlayed !== null) {
            const lastMatchDate = new Date(playerData.lastRankedGamePlayed);
            const now = new Date();
            const diffMs = now.getTime() - lastMatchDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor(diffMs / (1000 * 60));

            let timeAgoDisplay: string;
            if (diffDays > 0) {
              timeAgoDisplay = `${diffDays.toString()}d ago`;
            } else if (diffHours > 0) {
              timeAgoDisplay = `${diffHours.toString()}h ago`;
            } else if (diffMinutes > 0) {
              timeAgoDisplay = `${diffMinutes.toString()}m ago`;
            } else {
              timeAgoDisplay = "just now";
            }

            stats.push({
              name: "Last Match",
              value: diffMs,
              bestInTeam: false,
              bestInMatch: false,
              display: timeAgoDisplay,
            });
          }

          rows.push({
            type: "player",
            teamId: teamIndex,
            name: playerData.gamertag ?? playerData.discordName,
            stats,
            medals: [],
          });
        }
      }

      if (rows.length > 0) {
        groups.push({ matchIndex: -1, label: "Player Info", rows });
      }
    }

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

    const handleAnimationEnd = (event: AnimationEvent): void => {
      // Only handle the main scroll animation, not child element animations
      if (event.target !== tickerElement) {
        return;
      }
      setCurrentMatchIndex((prev) => (prev + 1) % tickerMatchGroups.length);
    };

    tickerElement.addEventListener("animationend", handleAnimationEnd);

    return (): void => {
      tickerElement.removeEventListener("animationend", handleAnimationEnd);
    };
  }, [tickerMatchGroups.length, streamerOptions.showTicker]);

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
    // Note: tickerMatchGroups and previousMatchCount intentionally excluded from deps to prevent infinite loop
  }, [allMatchStats.length, streamerOptions.showTicker]);

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
  const tabs: (TabData & { label: string; score?: string; icon?: string; teamColor?: string })[] = [
    {
      type: "series",
      label: `${state.guildName} #${state.queueNumber.toString()}`,
      score: state.seriesScore.replaceAll(/(🦅|🐍)/g, "").trim(),
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
                      tab.teamColor != null
                        ? ({
                            "--tab-team-color": tab.teamColor,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <div className={styles.tabContent}>
                      {tab.icon != null && <img src={tab.icon} alt="" className={styles.tabIcon} />}
                      <span className={styles.tabLabel}>{tab.label}</span>
                      {tab.score != null && (
                        <>
                          {" "}
                          • <span className={styles.tabScore}>{tab.score}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {/* Information Ticker */}
          {streamerOptions.showTicker && currentMatchGroup != null && (
            <InformationTicker
              currentMatchGroup={currentMatchGroup}
              teamColors={teamColors}
              tickerRef={tickerRef}
              currentMatchIndex={currentMatchIndex}
            />
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
            {selectedTab === -1 && state.matches.length === 0 && state.playersAssociationData ? (
              <PlayerPreSeriesInfo
                teams={state.teams}
                playersAssociationData={state.playersAssociationData}
                teamColors={teamColors}
              />
            ) : null}
            {selectedTab === -1 && seriesStats && state.matches.length > 0 ? (
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
