import React, { useState, useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
import { CSSTransition } from "react-transition-group";
import type { TeamColor } from "../team-colors/team-colors";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { InformationTicker, type TickerMatchGroup, type TickerStatRow } from "../information-ticker/information-ticker";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
import { ScrollingContent } from "../scrolling-content/scrolling-content";
import { RankIcon } from "../icons/rank-icon";
import discordLogo from "../../assets/discord-logo.png";
import xboxLogo from "../../assets/xbox-logo.png";
import { TeamIcon } from "../icons/team-icon";
import type { AllStreamerSettings } from "./settings/types";
import styles from "./streamer-overlay.module.css";
import { useTrackerState, useAllMatchStats, useSeriesStats, useTrackerInfo } from "./live-tracker-context";
import type { LiveTrackerNeatQueueStateRenderModel, LiveTrackerTeamRenderModel } from "./types";

export interface StreamerOverlayProps {
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly settings: AllStreamerSettings;
  readonly settingsUi: React.ReactNode;
}

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

export function StreamerOverlay({
  teamColors,
  gameModeIconUrl,
  settings,
  settingsUi,
}: StreamerOverlayProps): React.ReactElement {
  const trackerInfo = useTrackerInfo();
  const state = useTrackerState();
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();

  const [selectedTab, setSelectedTab] = useState(-1); // -1 = series, 0+ = match index
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [previousMatchCount, setPreviousMatchCount] = useState(0);
  const nodeRef = useRef<HTMLDivElement>(null);

  if (state?.type !== "neatqueue") {
    return <div className={styles.overlay}>Streamer overlay is only available for NeatQueue trackers</div>;
  }

  const neatQueueState: LiveTrackerNeatQueueStateRenderModel = state;

  // Apply per-series overrides
  const title =
    settings.series.titleOverride !== null && settings.series.titleOverride !== ""
      ? settings.series.titleOverride
      : settings.global.display.showTitle && trackerInfo.title
        ? trackerInfo.title
        : null;
  const subtitle =
    settings.series.subtitleOverride !== null && settings.series.subtitleOverride !== ""
      ? settings.series.subtitleOverride
      : settings.global.display.showSubtitle && trackerInfo.subtitle
        ? trackerInfo.subtitle
        : null;
  const iconUrl = settings.global.display.showServerIcon ? trackerInfo.iconUrl : null;

  // Generate ticker match groups with filtered stats
  const tickerMatchGroups = useMemo((): TickerMatchGroup[] => {
    const groups: TickerMatchGroup[] = [];

    // Filter function for stats based on settings
    const filterStats = (stats: TickerStatRow["stats"]): TickerStatRow["stats"] => {
      return stats.filter((stat) => {
        // For slayer stats, check if it's in the selected list
        if (settings.global.ticker.selectedSlayerStats.includes(stat.name)) {
          return true;
        }
        // For objective stats, check the toggle
        if (settings.global.ticker.showObjectiveStats) {
          // TODO: Identify objective stats - for now include all non-slayer stats
          return !settings.global.ticker.selectedSlayerStats.includes(stat.name);
        }
        return false;
      });
    };

    const medalWeights = new Map(Object.values(state.medalMetadata).map((m) => [m.name, m.sortingWeight]));
    const difficultyRange = new Map([
      [0, [0, 99]],
      [1, [100, 149]],
      [2, [150, 199]],
      [3, [200, Infinity]],
    ]);
    const filterMedals = (medals: TickerStatRow["medals"]): TickerStatRow["medals"] => {
      return medals.filter((medal) => {
        const weight = medalWeights.get(medal.name);
        if (weight === undefined) {
          return false;
        }

        for (const [difficultyIndex, [minWeight, maxWeight]] of difficultyRange.entries()) {
          if (weight >= minWeight && weight <= maxWeight) {
            return settings.global.ticker.medalRarityFilter.includes(difficultyIndex);
          }
        }

        return false;
      });
    };

    // Pre-series player info (if enabled)
    if (
      settings.global.ticker.showPreSeriesInfo &&
      neatQueueState.matches.length === 0 &&
      neatQueueState.playersAssociationData
    ) {
      const playersAssociationData = new Map(Object.entries(neatQueueState.playersAssociationData));
      const rows: TickerStatRow[] = [];

      for (const [teamIndex, team] of neatQueueState.teams.entries()) {
        for (const player of team.players) {
          const playerData = playersAssociationData.get(player.id);
          if (!playerData) {
            continue;
          }

          const playerName = playerData.gamertag ?? playerData.discordName;
          const playerStats: TickerStatRow["stats"] = [];

          // Current Rank
          if (playerData.currentRank !== null && playerData.currentRank >= 0) {
            playerStats.push({
              name: "Current rank",
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
            playerStats.push({
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
            const { rankTier, subTier } = getRankTierFromCsr(playerData.esra);
            playerStats.push({
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

          rows.push({
            type: "player",
            teamId: teamIndex,
            name: playerName,
            stats: playerStats,
            medals: [],
          });
        }
      }

      if (rows.length > 0) {
        groups.push({ matchIndex: -1, label: "Player Info", rows });
      }
    }

    // Series stats
    if (seriesStats && seriesStats.teamData.length > 0) {
      const rows: TickerStatRow[] = [];

      // Team stats
      for (const teamData of seriesStats.teamData.values()) {
        const { teamId, teamStats, teamMedals } = teamData;
        const { eagleTeamNameOverride, cobraTeamNameOverride } = settings.series;
        const teamOverride = teamId === 0 ? eagleTeamNameOverride : cobraTeamNameOverride;

        let teamName = teamId === 0 ? "Eagle" : "Cobra";
        if (teamOverride !== null && teamOverride !== "") {
          teamName = teamOverride;
        } else if (neatQueueState.teams[teamId]?.name) {
          teamName = neatQueueState.teams[teamId].name;
        }

        rows.push({
          type: "team",
          teamId,
          name: `${teamName} (Accumulated)`,
          stats: filterStats(teamStats),
          medals: filterMedals(teamMedals),
        });
      }

      // Player stats
      for (const teamData of seriesStats.playerData) {
        const { teamId } = teamData;
        for (const player of teamData.players) {
          rows.push({
            type: "player",
            teamId,
            name: player.name,
            stats: filterStats(player.values),
            medals: filterMedals(player.medals),
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
          const { teamId, teamStats, teamMedals } = teamData;
          const { eagleTeamNameOverride, cobraTeamNameOverride } = settings.series;
          const teamOverride = teamId === 0 ? eagleTeamNameOverride : cobraTeamNameOverride;

          let teamName = teamId === 0 ? "Eagle" : "Cobra";
          if (teamOverride !== null && teamOverride !== "") {
            teamName = teamOverride;
          } else if (neatQueueState.teams[teamId]?.name) {
            teamName = neatQueueState.teams[teamId].name;
          }

          rows.push({
            type: "team",
            teamId,
            name: `${teamName} (Accumulated)`,
            stats: filterStats(teamStats),
            medals: filterMedals(teamMedals),
          });
        }

        // Player stats for this match
        for (const teamData of matchStat.data) {
          const { teamId } = teamData;
          for (const player of teamData.players) {
            rows.push({
              type: "player",
              teamId,
              name: player.name,
              stats: filterStats(player.values),
              medals: filterMedals(player.medals),
            });
          }
        }

        const matchModel = neatQueueState.matches[matchIndex];
        const label = matchModel.gameTypeAndMap;
        groups.push({ matchIndex, label, rows });
      }
    }

    return groups;
  }, [
    neatQueueState,
    seriesStats,
    allMatchStats,
    settings.global.ticker.selectedSlayerStats,
    settings.global.ticker.showObjectiveStats,
    settings.global.ticker.medalRarityFilter,
    settings.global.ticker.showPreSeriesInfo,
  ]);

  // Handler for when ticker scroll animation completes
  const handleScrollComplete = (): void => {
    setCurrentMatchIndex((prevIndex) => (prevIndex + 1) % tickerMatchGroups.length);
  };

  // When a new match is added, jump to it (only if ticker is enabled)
  useEffect(() => {
    if (!settings.global.ticker.showTicker) {
      return;
    }

    const currentMatchCount = allMatchStats.length;

    if (currentMatchCount > previousMatchCount && previousMatchCount > 0) {
      const latestMatchIndex = tickerMatchGroups.findIndex((group) => group.matchIndex === currentMatchCount - 1);
      if (latestMatchIndex !== -1) {
        setCurrentMatchIndex(latestMatchIndex);
      }
    }

    setPreviousMatchCount(currentMatchCount);
  }, [allMatchStats.length, settings.global.ticker.showTicker, tickerMatchGroups, previousMatchCount]);

  const handleTabClick = (tabIndex: number): void => {
    const openPanel = selectedTab === tabIndex ? !isPanelOpen : true;
    setSelectedTab(tabIndex);
    setIsPanelOpen(openPanel);
  };

  const handleClosePanel = (): void => {
    setIsPanelOpen(false);
  };

  const currentMatchGroup = tickerMatchGroups[currentMatchIndex];
  const activeTabIndex =
    settings.global.ticker.showTicker && Boolean(currentMatchGroup) ? currentMatchGroup.matchIndex : undefined;

  // Helper to render player name content
  const renderPlayerNameContent = (playerId: string, displayName: string): React.ReactElement => {
    const playerData = neatQueueState.playersAssociationData?.[playerId];
    const showDiscord = settings.global.display.showDiscordNames;
    const showXbox = settings.global.display.showXboxNames;

    if (!showDiscord && !showXbox) {
      // Show at least one - default to display name
      return <>{displayName}</>;
    }

    const discordName = playerData?.discordName ?? displayName;
    const gamertag = playerData?.gamertag ?? null;
    const namesAreSame = discordName.toLowerCase() === gamertag?.toLowerCase();

    if (showDiscord && showXbox) {
      if (namesAreSame) {
        return (
          <>
            <img src={discordLogo.src} alt="Discord" className={styles.playerIcon} />
            <img src={xboxLogo.src} alt="Xbox" className={styles.playerIcon} /> {gamertag}
          </>
        );
      }

      return (
        <>
          <img src={discordLogo.src} alt="Discord" className={styles.playerIcon} /> {discordName}
          {gamertag != null && (
            <>
              {" "}
              <img src={xboxLogo.src} alt="Xbox" className={styles.playerIcon} /> {gamertag}
            </>
          )}
        </>
      );
    }

    if (showDiscord) {
      return (
        <>
          <img src={discordLogo.src} alt="Discord" className={styles.playerIcon} /> {discordName}
        </>
      );
    }

    if (showXbox && gamertag !== null && gamertag !== "") {
      return (
        <>
          <img src={xboxLogo.src} alt="Xbox" className={styles.playerIcon} /> {gamertag}
        </>
      );
    }

    return <>{displayName}</>;
  };

  const teamRender = (team: LiveTrackerTeamRenderModel, teamName: string | null): React.ReactNode => {
    const scrollingContent = (
      <ScrollingContent maxWidth={600} className={styles.teamPlayersScroll}>
        {team.players.map((player, idx) => (
          <React.Fragment key={player.id}>
            {idx > 0 && ", "}
            {renderPlayerNameContent(player.id, player.displayName)}
          </React.Fragment>
        ))}
      </ScrollingContent>
    );

    if (teamName == null || teamName === "") {
      return scrollingContent;
    }

    if (settings.series.disableTeamPlayerNames === true) {
      return <div className={styles.teamName}>{teamName}</div>;
    }

    return (
      <div className={styles.teamWithPlayers}>
        <div className={styles.teamName}>{teamName}</div>
        {scrollingContent}
      </div>
    );
  };
  const teamLeft = teamRender(neatQueueState.teams[0], settings.series.eagleTeamNameOverride);
  const teamRight = teamRender(neatQueueState.teams[1], settings.series.cobraTeamNameOverride);

  // Build tabs array
  const tabs = [
    {
      type: "series" as const,
      index: -1,
      label: "Series score",
      score: neatQueueState.seriesScore,
      teamColor: undefined,
    },
    ...neatQueueState.matches.map((match, idx) => {
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
        index: idx,
        matchId: match.matchId,
        label: settings.global.ticker.showTabs ? match.gameMap : "",
        score: match.gameScore,
        icon: gameModeIconUrl(match.gameType),
        teamColor,
      };
    }),
  ];

  // CSS custom properties for font sizes
  const fontSizeStyles = {
    "--font-size-queue-info": (settings.global.fontSizes.queueInfo / 100).toString(),
    "--font-size-score": (settings.global.fontSizes.score / 100).toString(),
    "--font-size-teams": (settings.global.fontSizes.teams / 100).toString(),
    "--font-size-tabs": (settings.global.fontSizes.tabs / 100).toString(),
    "--font-size-ticker": (settings.global.fontSizes.ticker / 100).toString(),
  } as React.CSSProperties;

  return (
    <div
      className={classNames(styles.overlay, {
        [styles.previewPlayer]: settings.global.viewPreview && settings.global.colors.mode === "player",
        [styles.previewObserver]: settings.global.viewPreview && settings.global.colors.mode === "observer",
      })}
      style={fontSizeStyles}
    >
      {settingsUi}

      {/* Top Section: Teams and Score */}
      <div className={styles.topSection}>
        {title != null && <div className={styles.title}>{title}</div>}
        {iconUrl != null && <img src={iconUrl} alt="Server" className={styles.serverIcon} />}
        {subtitle != null && <div className={styles.subtitle}>{subtitle}</div>}
        {settings.global.display.showScore && (
          <>
            <div className={styles.teamLeftScore} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
              {neatQueueState.seriesScore.split(":")[0]}
            </div>
            <div
              className={styles.teamRightScore}
              style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}
            >
              {neatQueueState.seriesScore.split(":")[1]}
            </div>
          </>
        )}
        {settings.global.display.showTeamDetails && (
          <>
            <div className={styles.teamLeft} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
              <TeamIcon teamId={0} />
              <div className={styles.teamPlayers}>{teamLeft}</div>
            </div>
            <div className={styles.teamRight} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
              <TeamIcon teamId={1} />
              <div className={styles.teamPlayers}>{teamRight}</div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Section: Ticker and Tabs */}
      {(settings.global.ticker.showTabs || settings.global.ticker.showTicker) && (
        <div className={styles.bottomSection}>
          {/* Bottom Tabs */}
          {settings.global.ticker.showTabs && (
            <div className={styles.tabBar}>
              {tabs.map((tab) => {
                const tabIndex = tab.type === "series" ? -1 : tab.index;
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
                      {tab.type === "match" && tab.icon && <img src={tab.icon} alt="" className={styles.tabIcon} />}
                      <span className={styles.tabLabel}>{tab.label}</span>
                      {tab.score && (
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
          {settings.global.ticker.showTicker && Boolean(currentMatchGroup) && (
            <InformationTicker
              currentMatchGroup={currentMatchGroup}
              teamColors={teamColors}
              onScrollComplete={handleScrollComplete}
            />
          )}

          {/* Waiting for first match message when ticker is enabled but no data yet and pre-series info is disabled */}
          {settings.global.ticker.showTicker &&
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            currentMatchGroup == null &&
            !settings.global.ticker.showPreSeriesInfo &&
            neatQueueState.matches.length === 0 && (
              <div className={styles.tickerPlaceholder}>Waiting for first match to complete...</div>
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
            {selectedTab === -1 && neatQueueState.matches.length === 0 && neatQueueState.playersAssociationData ? (
              <PlayerPreSeriesInfo
                teams={neatQueueState.teams}
                playersAssociationData={neatQueueState.playersAssociationData}
                teamColors={teamColors}
              />
            ) : null}
            {selectedTab === -1 && seriesStats && neatQueueState.matches.length > 0 ? (
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
                id={neatQueueState.matches[selectedTab].matchId}
                backgroundImageUrl={neatQueueState.matches[selectedTab].gameMapThumbnailUrl}
                gameModeIconUrl={gameModeIconUrl(neatQueueState.matches[selectedTab].gameType)}
                gameModeAlt={neatQueueState.matches[selectedTab].gameType}
                matchNumber={selectedTab + 1}
                gameTypeAndMap={neatQueueState.matches[selectedTab].gameTypeAndMap}
                duration={neatQueueState.matches[selectedTab].duration}
                score={neatQueueState.matches[selectedTab].gameScore}
                startTime={neatQueueState.matches[selectedTab].startTime}
                endTime={neatQueueState.matches[selectedTab].endTime}
                teamColors={teamColors}
              />
            ) : null}
          </div>
        </div>
      </CSSTransition>
    </div>
  );
}
