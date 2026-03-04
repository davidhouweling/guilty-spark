// TODO: work out why the types aren't aligned
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import classNames from "classnames";
import { CSSTransition } from "react-transition-group";
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
import { ScrollingContent } from "../scrolling-content/scrolling-content";
import { RankIcon } from "../icons/rank-icon";

function getRankTierFromCsr(csr: number): { rankTier: string; subTier: number } {
  if (csr >= 1500) {
    return { rankTier: "Onyx", subTier: 0 };
  }
  if (csr >= 1450) {
    return { rankTier: "Diamond", subTier: 5 };
  }
  if (csr >= 1400) {
    return { rankTier: "Diamond", subTier: 4 };
  }
  if (csr >= 1350) {
    return { rankTier: "Diamond", subTier: 3 };
  }
  if (csr >= 1300) {
    return { rankTier: "Diamond", subTier: 2 };
  }
  if (csr >= 1250) {
    return { rankTier: "Diamond", subTier: 1 };
  }
  if (csr >= 1200) {
    return { rankTier: "Diamond", subTier: 0 };
  }
  if (csr >= 1150) {
    return { rankTier: "Platinum", subTier: 5 };
  }
  if (csr >= 1100) {
    return { rankTier: "Platinum", subTier: 4 };
  }
  if (csr >= 1050) {
    return { rankTier: "Platinum", subTier: 3 };
  }
  if (csr >= 1000) {
    return { rankTier: "Platinum", subTier: 2 };
  }
  if (csr >= 950) {
    return { rankTier: "Platinum", subTier: 1 };
  }
  if (csr >= 900) {
    return { rankTier: "Platinum", subTier: 0 };
  }
  if (csr >= 850) {
    return { rankTier: "Gold", subTier: 5 };
  }
  if (csr >= 800) {
    return { rankTier: "Gold", subTier: 4 };
  }
  if (csr >= 750) {
    return { rankTier: "Gold", subTier: 3 };
  }
  if (csr >= 700) {
    return { rankTier: "Gold", subTier: 2 };
  }
  if (csr >= 650) {
    return { rankTier: "Gold", subTier: 1 };
  }
  if (csr >= 600) {
    return { rankTier: "Gold", subTier: 0 };
  }
  if (csr >= 550) {
    return { rankTier: "Silver", subTier: 5 };
  }
  if (csr >= 500) {
    return { rankTier: "Silver", subTier: 4 };
  }
  if (csr >= 450) {
    return { rankTier: "Silver", subTier: 3 };
  }
  if (csr >= 400) {
    return { rankTier: "Silver", subTier: 2 };
  }
  if (csr >= 350) {
    return { rankTier: "Silver", subTier: 1 };
  }
  if (csr >= 300) {
    return { rankTier: "Silver", subTier: 0 };
  }
  if (csr >= 250) {
    return { rankTier: "Bronze", subTier: 5 };
  }
  if (csr >= 200) {
    return { rankTier: "Bronze", subTier: 4 };
  }
  if (csr >= 150) {
    return { rankTier: "Bronze", subTier: 3 };
  }
  if (csr >= 100) {
    return { rankTier: "Bronze", subTier: 2 };
  }
  if (csr >= 50) {
    return { rankTier: "Bronze", subTier: 1 };
  }
  return { rankTier: "Bronze", subTier: 0 };
}
import discordLogo from "../../assets/discord-logo.png";
import XboxLogo from "../../assets/xbox-logo.png";
import styles from "./streamer-overlay.module.css";
import { useTrackerInfo, useTrackerState, useAllMatchStats, useSeriesStats } from "./live-tracker-context";

interface StreamerOverlayProps {
  readonly teamColors: TeamColor[];
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

const StreamerOverlayComponent = function StreamerOverlay({
  teamColors,
  gameModeIconUrl,
  viewMode,
  onViewModeSelect,
  previewMode,
  onPreviewModeSelect,
  streamerOptions,
  onStreamerOptionsChange,
}: StreamerOverlayProps): React.ReactElement {
  // Use context to get data
  const model = { state: useTrackerState(), ...useTrackerInfo() };
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();

  const [selectedTab, setSelectedTab] = useState<number>(-1); // -1 = series, 0+ = match index
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0); // Index of which match to show in ticker
  const [previousMatchCount, setPreviousMatchCount] = useState<number>(0);
  const nodeRef = useRef<HTMLDivElement>(null);

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

      // Build ticker rows per team with all players' stats combined
      for (const [teamIndex, team] of state.teams.entries()) {
        const teamStats: {
          name: string;
          value: number;
          bestInTeam: boolean;
          bestInMatch: boolean;
          display: string;
          icon?: React.ReactNode;
        }[] = [];

        for (const player of team.players) {
          const playerData = state.playersAssociationData[player.id];
          if (playerData == null) {
            continue;
          }

          const playerName = playerData.gamertag ?? playerData.discordName;

          // Current Rank
          if (playerData.currentRank !== null && playerData.currentRank >= 0) {
            teamStats.push({
              name: `${playerName} - Current rank`,
              value: playerData.currentRank,
              bestInTeam: false,
              bestInMatch: false,
              display: playerData.currentRank.toLocaleString(),
              icon: (
                <RankIcon
                  rankTier={playerData.currentRankTier}
                  subTier={playerData.currentRankSubTier}
                  measurementMatchesRemaining={playerData.currentRankMeasurementMatchesRemaining}
                  initialMeasurementMatches={playerData.currentRankInitialMeasurementMatches}
                  size="x-small"
                />
              ),
            });
          }

          // Peak Rank
          if (playerData.allTimePeakRank !== null && playerData.allTimePeakRank >= 0) {
            const { rankTier, subTier } = getRankTierFromCsr(playerData.allTimePeakRank);
            teamStats.push({
              name: `Peak rank`,
              value: playerData.allTimePeakRank,
              bestInTeam: false,
              bestInMatch: false,
              display: playerData.allTimePeakRank.toLocaleString(),
              icon: (
                <RankIcon
                  rankTier={rankTier}
                  subTier={subTier}
                  measurementMatchesRemaining={null}
                  initialMeasurementMatches={null}
                  size="x-small"
                />
              ),
            });
          }

          // ESRA
          if (playerData.esra !== null && playerData.esra >= 0) {
            // Calculate rank tier from ESRA
            const { rankTier, subTier } = getRankTierFromCsr(playerData.esra);
            teamStats.push({
              name: `ESRA`,
              value: playerData.esra,
              bestInTeam: false,
              bestInMatch: false,
              display: Math.round(playerData.esra).toLocaleString(),
              icon: (
                <RankIcon
                  rankTier={rankTier}
                  subTier={subTier}
                  measurementMatchesRemaining={null}
                  initialMeasurementMatches={null}
                  size="x-small"
                />
              ),
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
            let stableValue: number;
            if (diffDays > 0) {
              timeAgoDisplay = `${diffDays.toString()}d ago`;
              stableValue = diffDays * 1000000; // Stable by day
            } else if (diffHours > 0) {
              timeAgoDisplay = `${diffHours.toString()}h ago`;
              stableValue = diffHours * 10000; // Stable by hour
            } else if (diffMinutes > 0) {
              timeAgoDisplay = `${diffMinutes.toString()}m ago`;
              stableValue = diffMinutes * 100; // Stable by minute
            } else {
              timeAgoDisplay = "just now";
              stableValue = 0;
            }

            teamStats.push({
              name: `Last ranked game played`,
              value: stableValue, // Use stable value instead of actual diffMs
              bestInTeam: false,
              bestInMatch: false,
              display: timeAgoDisplay,
            });
          }
        }

        if (teamStats.length > 0) {
          rows.push({
            type: "team",
            teamId: teamIndex,
            name: `Team ${team.name}`,
            stats: teamStats,
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

  // Handler for when ticker scroll animation completes
  const handleScrollComplete = (): void => {
    setCurrentMatchIndex((prevIndex) => (prevIndex + 1) % tickerMatchGroups.length);
  };

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
    const openPanel = selectedTab === tabIndex ? !isPanelOpen : true;
    setSelectedTab(tabIndex);
    setIsPanelOpen(openPanel);
  };

  const handleClosePanel = (): void => {
    setIsPanelOpen(false);
  };

  const currentMatchGroup = tickerMatchGroups[currentMatchIndex];
  const activeTabIndex = streamerOptions.showTicker ? currentMatchGroup?.matchIndex : undefined;

  // Helper to render player name content for streamer overlay
  const renderPlayerNameContent = (playerId: string, displayName: string): React.ReactElement => {
    const playerData = state.playersAssociationData?.[playerId];
    const discordName = playerData?.discordName ?? displayName;
    const gamertag = playerData?.gamertag ?? null;
    const namesAreSame = discordName.toLowerCase() === gamertag?.toLowerCase();

    if (namesAreSame) {
      return (
        <>
          <img src={discordLogo.src} alt="Discord" className={styles.playerIcon} />
          <img src={XboxLogo.src} alt="Xbox" className={styles.playerIcon} /> {gamertag}
        </>
      );
    }

    return (
      <>
        <img src={discordLogo.src} alt="Discord" className={styles.playerIcon} /> {discordName}
        {gamertag != null && (
          <>
            {" "}
            <img src={XboxLogo.src} alt="Xbox" className={styles.playerIcon} /> {gamertag}
          </>
        )}
      </>
    );
  };

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
                <ScrollingContent maxWidth={400}>
                  {state.teams[0]?.players.map((p, idx) => (
                    <React.Fragment key={p.id}>
                      {idx > 0 && ", "}
                      {renderPlayerNameContent(p.id, p.displayName)}
                    </React.Fragment>
                  ))}
                </ScrollingContent>
              </span>
            </div>
            <div className={styles.teamRight} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
              <span className={styles.teamName}>{state.teams[1]?.name ?? "Team 2"}:</span>
              <span className={styles.teamPlayers}>
                <ScrollingContent maxWidth={400}>
                  {state.teams[1]?.players.map((p, idx) => (
                    <React.Fragment key={p.id}>
                      {idx > 0 && ", "}
                      {renderPlayerNameContent(p.id, p.displayName)}
                    </React.Fragment>
                  ))}
                </ScrollingContent>
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
                const isSelected = selectedTab === tabIndex && isPanelOpen;

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
              onScrollComplete={handleScrollComplete}
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
};

// Custom comparison to prevent re-renders when props haven't changed
// Note: model/stats data comes from context hooks, React handles those re-renders automatically
function arePropsEqual(prevProps: StreamerOverlayProps, nextProps: StreamerOverlayProps): boolean {
  return (
    prevProps.teamColors === nextProps.teamColors &&
    prevProps.gameModeIconUrl === nextProps.gameModeIconUrl &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.onViewModeSelect === nextProps.onViewModeSelect &&
    prevProps.previewMode === nextProps.previewMode &&
    prevProps.onPreviewModeSelect === nextProps.onPreviewModeSelect &&
    prevProps.onStreamerOptionsChange === nextProps.onStreamerOptionsChange &&
    // Check streamerOptions deeply
    prevProps.streamerOptions.showTeams === nextProps.streamerOptions.showTeams &&
    prevProps.streamerOptions.showTicker === nextProps.streamerOptions.showTicker &&
    prevProps.streamerOptions.showTabs === nextProps.streamerOptions.showTabs &&
    prevProps.streamerOptions.showServerName === nextProps.streamerOptions.showServerName
  );
}

export const StreamerOverlay = memo(StreamerOverlayComponent, arePropsEqual);
