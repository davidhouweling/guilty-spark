import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import classNames from "classnames";
import { getRankTierFromCsr } from "@guilty-spark/shared/halo/rank";
import TimeAgo from "javascript-time-ago";
import { differenceInHours } from "date-fns";
import type { TeamColor } from "../../team-colors/team-colors";
import { type TickerMatchGroup, type TickerStatRow } from "../../information-ticker/information-ticker";
import { RankIcon } from "../../icons/rank-icon";
import discordLogo from "../../../assets/discord-logo.png";
import xboxLogo from "../../../assets/xbox-logo.png";
import { ALL_SLAYER_STATS, type AllStreamerSettings } from "../settings/types";
import { useTrackerState, useAllMatchStats, useSeriesStats, useTrackerInfo } from "../live-tracker-context";
import type { LiveTrackerNeatQueueStateRenderModel } from "../types";
import { TopSection } from "./top-section";
import type { OverlayTab } from "./tabs-bar";
import { TeamDetailsContent } from "./team-details-content";
import { BottomSection } from "./bottom-section";
import { StatsPanel } from "./stats-panel";
import styles from "./streamer-overlay.module.css";
import "javascript-time-ago/locale/en";

export interface StreamerOverlayProps {
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly settings: AllStreamerSettings;
  readonly settingsUi: React.ReactNode;
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
  const timeAgo = new TimeAgo("en");

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
          return !(ALL_SLAYER_STATS as readonly string[]).includes(stat.name);
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

          if (playerData.currentRank == null && playerData.esra == null && playerData.allTimePeakRank == null) {
            playerStats.push({
              name: "Player information",
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "No data",
            });

            continue;
          }

          if (playerData.currentRank !== null) {
            // Current Rank
            playerStats.push({
              name: "Current rank",
              value: playerData.currentRank,
              bestInTeam: false,
              bestInMatch: false,
              display: playerData.currentRank > 0 ? playerData.currentRank.toLocaleString() : "Unranked",
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
          } else {
            playerStats.push({
              name: "Current rank",
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "Unranked",
            });
          }

          // Peak Rank
          if (playerData.allTimePeakRank !== null) {
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
          } else {
            playerStats.push({
              name: `Peak rank`,
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "-",
            });
          }

          // ESRA
          if (playerData.esra !== null) {
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
          } else {
            playerStats.push({
              name: `ESRA`,
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "-",
            });
          }

          if (playerData.lastRankedGamePlayed != null) {
            const ago = differenceInHours(new Date(), new Date(playerData.lastRankedGamePlayed));
            const display =
              ago < 1 ? "Less than an hour ago" : timeAgo.format(new Date(playerData.lastRankedGamePlayed));
            playerStats.push({
              name: "Last ranked match played",
              value: new Date(playerData.lastRankedGamePlayed).getTime(),
              bestInTeam: false,
              bestInMatch: false,
              display,
            });
          } else {
            playerStats.push({
              name: "Last ranked match played",
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "-",
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

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      const openPanel = selectedTab === tabIndex ? !isPanelOpen : true;
      setSelectedTab(tabIndex);
      setIsPanelOpen(openPanel);
    },
    [isPanelOpen, selectedTab],
  );

  const handleClosePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  const currentMatchGroup = tickerMatchGroups[currentMatchIndex];
  const activeTabIndex =
    settings.global.ticker.showTicker && Boolean(currentMatchGroup) ? currentMatchGroup.matchIndex : undefined;
  const selectedMatchStats = selectedTab >= 0 ? (allMatchStats[selectedTab]?.data ?? null) : null;
  const selectedMatch = selectedTab >= 0 ? (neatQueueState.matches[selectedTab] ?? null) : null;

  // Helper to render player name content
  const renderPlayerNameContent = useCallback(
    (playerId: string, displayName: string): React.ReactElement => {
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
    },
    [
      neatQueueState.playersAssociationData,
      settings.global.display.showDiscordNames,
      settings.global.display.showXboxNames,
    ],
  );

  const teamLeft = useMemo(
    (): React.ReactNode => (
      <TeamDetailsContent
        team={neatQueueState.teams[0]}
        teamName={settings.series.eagleTeamNameOverride}
        disableTeamPlayerNames={Boolean(settings.series.disableTeamPlayerNames)}
        renderPlayerNameContent={renderPlayerNameContent}
      />
    ),
    [
      neatQueueState.teams,
      renderPlayerNameContent,
      settings.series.disableTeamPlayerNames,
      settings.series.eagleTeamNameOverride,
    ],
  );

  const teamRight = useMemo(
    (): React.ReactNode => (
      <TeamDetailsContent
        team={neatQueueState.teams[1]}
        teamName={settings.series.cobraTeamNameOverride}
        disableTeamPlayerNames={Boolean(settings.series.disableTeamPlayerNames)}
        renderPlayerNameContent={renderPlayerNameContent}
      />
    ),
    [
      neatQueueState.teams,
      renderPlayerNameContent,
      settings.series.disableTeamPlayerNames,
      settings.series.cobraTeamNameOverride,
    ],
  );

  // Build tabs array
  const tabs = useMemo<readonly OverlayTab[]>(
    () => [
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
    ],
    [gameModeIconUrl, neatQueueState.matches, neatQueueState.seriesScore, settings.global.ticker.showTabs, teamColors],
  );

  const { showScore, showTeamDetails } = settings.global.display;
  const { showTabs, showTicker } = settings.global.ticker;

  // CSS custom properties for font sizes
  const fontSizeStyles = useMemo(
    () =>
      ({
        "--font-size-queue-info": (settings.global.fontSizes.queueInfo / 100).toString(),
        "--font-size-score": (settings.global.fontSizes.score / 100).toString(),
        "--font-size-teams": (settings.global.fontSizes.teams / 100).toString(),
        "--font-size-tabs": (settings.global.fontSizes.tabs / 100).toString(),
        "--font-size-ticker": (settings.global.fontSizes.ticker / 100).toString(),
      }) as React.CSSProperties,
    [
      settings.global.fontSizes.queueInfo,
      settings.global.fontSizes.score,
      settings.global.fontSizes.teams,
      settings.global.fontSizes.tabs,
      settings.global.fontSizes.ticker,
    ],
  );

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
      <TopSection
        title={title}
        subtitle={subtitle}
        iconUrl={iconUrl}
        showScore={showScore}
        showTeamDetails={showTeamDetails}
        seriesScore={neatQueueState.seriesScore}
        teamColors={teamColors}
        teamLeft={teamLeft}
        teamRight={teamRight}
      />

      <BottomSection
        showTabs={showTabs}
        showTicker={showTicker}
        showPreSeriesInfo={settings.global.ticker.showPreSeriesInfo}
        matchesLength={neatQueueState.matches.length}
        currentMatchGroup={currentMatchGroup}
        teamColors={teamColors}
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        selectedTab={selectedTab}
        isPanelOpen={isPanelOpen}
        onTabClick={handleTabClick}
        onScrollComplete={handleScrollComplete}
      />

      <StatsPanel
        isPanelOpen={isPanelOpen}
        nodeRef={nodeRef}
        onClosePanel={handleClosePanel}
        selectedTab={selectedTab}
        teams={neatQueueState.teams}
        playersAssociationData={neatQueueState.playersAssociationData}
        matchesLength={neatQueueState.matches.length}
        seriesStats={seriesStats}
        selectedMatchStats={selectedMatchStats}
        selectedMatch={selectedMatch}
        teamColors={teamColors}
        gameModeIconUrl={gameModeIconUrl}
      />
    </div>
  );
}
