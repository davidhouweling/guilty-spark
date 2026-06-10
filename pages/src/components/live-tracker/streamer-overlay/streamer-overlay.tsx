import React, { useMemo, useCallback } from "react";
import { getRankTierFromCsr } from "@guilty-spark/shared/halo/rank";
import { getTeamName } from "@guilty-spark/shared/halo/team";
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
import { TopSection } from "../../streamer-overlay/top-section";
import { TeamDetailsContent } from "../../streamer-overlay/team-details-content";
import { StreamerOverlay as SharedStreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
import { StatsPanelContent } from "./stats-panel";
import styles from "./streamer-overlay.module.css";
import "javascript-time-ago/locale/en";

const timeAgo = new TimeAgo("en");

const DIFFICULTY_RANGE = new Map([
  [0, [0, 99]],
  [1, [100, 149]],
  [2, [150, 199]],
  [3, [200, Infinity]],
]);

export interface StreamerOverlayProps {
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string, gameVariantCategory?: number) => string;
  readonly settings: AllStreamerSettings;
  readonly settingsUi: React.ReactNode;
}

function resolveTeamName(
  teamId: number,
  teams: readonly { name: string }[],
  overrides: { eagleTeamNameOverride: string | null; cobraTeamNameOverride: string | null },
): string {
  const override = teamId === 0 ? overrides.eagleTeamNameOverride : overrides.cobraTeamNameOverride;
  if (override !== null && override !== "") {
    return override;
  }
  return teams[teamId]?.name ?? getTeamName(teamId);
}

interface NeatQueueStreamerOverlayProps {
  readonly neatQueueState: LiveTrackerNeatQueueStateRenderModel;
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string, gameVariantCategory?: number) => string;
  readonly settings: AllStreamerSettings;
  readonly settingsUi: React.ReactNode;
}

function NeatQueueStreamerOverlay({
  neatQueueState,
  teamColors,
  gameModeIconUrl,
  settings,
  settingsUi,
}: NeatQueueStreamerOverlayProps): React.ReactElement {
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();
  const trackerInfo = useTrackerInfo();

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

  const tickerMatchGroups = useMemo((): TickerMatchGroup[] => {
    const groups: TickerMatchGroup[] = [];

    const filterStats = (stats: TickerStatRow["stats"]): TickerStatRow["stats"] => {
      return stats.filter((stat) => {
        if (settings.global.ticker.selectedSlayerStats.includes(stat.name)) {
          return true;
        }
        if (settings.global.ticker.showObjectiveStats) {
          return !(ALL_SLAYER_STATS as readonly string[]).includes(stat.name);
        }
        return false;
      });
    };

    const medalWeights = new Map(Object.values(neatQueueState.medalMetadata).map((m) => [m.name, m.sortingWeight]));
    const filterMedals = (medals: TickerStatRow["medals"]): TickerStatRow["medals"] => {
      return medals.filter((medal) => {
        const weight = medalWeights.get(medal.name);
        if (weight === undefined) {
          return false;
        }

        for (const [difficultyIndex, [minWeight, maxWeight]] of DIFFICULTY_RANGE.entries()) {
          if (weight >= minWeight && weight <= maxWeight) {
            return settings.global.ticker.medalRarityFilter.includes(difficultyIndex);
          }
        }

        return false;
      });
    };

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

    if (seriesStats && seriesStats.teamData.length > 0) {
      const rows: TickerStatRow[] = [];

      for (const teamData of seriesStats.teamData.values()) {
        const { teamId, teamStats, teamMedals } = teamData;
        const teamName = resolveTeamName(teamId, neatQueueState.teams, settings.series);

        rows.push({
          type: "team",
          teamId,
          name: `${teamName} (Accumulated)`,
          stats: filterStats(teamStats),
          medals: filterMedals(teamMedals),
        });
      }

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

    for (const [matchIndex, matchStat] of allMatchStats.entries()) {
      if (matchStat.data) {
        const rows: TickerStatRow[] = [];

        for (const teamData of matchStat.data) {
          const { teamId, teamStats, teamMedals } = teamData;
          const teamName = resolveTeamName(teamId, neatQueueState.teams, settings.series);

          rows.push({
            type: "team",
            teamId,
            name: `${teamName} (Accumulated)`,
            stats: filterStats(teamStats),
            medals: filterMedals(teamMedals),
          });
        }

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

  const hasPanelContent = useCallback(
    (tabIndex: number): boolean => {
      if (tabIndex === -1) {
        if (neatQueueState.matches.length === 0 && neatQueueState.playersAssociationData != null) {
          return true;
        }
        return seriesStats != null && neatQueueState.matches.length > 0;
      }
      return allMatchStats[tabIndex]?.data != null && Boolean(neatQueueState.matches[tabIndex]);
    },
    [allMatchStats, neatQueueState, seriesStats],
  );

  const renderPanelContent = useCallback(
    (tabIndex: number): React.ReactElement | null => {
      const selectedMatchStats = tabIndex >= 0 ? (allMatchStats[tabIndex]?.data ?? null) : null;
      const selectedMatch = tabIndex >= 0 ? (neatQueueState.matches[tabIndex] ?? null) : null;
      return (
        <StatsPanelContent
          selectedTab={tabIndex}
          teams={neatQueueState.teams}
          playersAssociationData={neatQueueState.playersAssociationData}
          matchesLength={neatQueueState.matches.length}
          seriesStats={seriesStats}
          selectedMatchStats={selectedMatchStats}
          selectedMatch={selectedMatch}
          teamColors={teamColors}
          gameModeIconUrl={gameModeIconUrl}
        />
      );
    },
    [allMatchStats, gameModeIconUrl, neatQueueState, seriesStats, teamColors],
  );

  const renderPlayerNameContent = useCallback(
    (playerId: string, displayName: string): React.ReactElement => {
      const playerData = neatQueueState.playersAssociationData?.[playerId];
      const showDiscord = settings.global.display.showDiscordNames;
      const showXbox = settings.global.display.showXboxNames;

      if (!showDiscord && !showXbox) {
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
        let winningTeamIndex: number | null = null;
        if (match.rawMatchStats) {
          const winningTeam = match.rawMatchStats.Teams.find((team) => team.Outcome === 2);
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
          icon: gameModeIconUrl(match.gameType, match.rawMatchStats?.MatchInfo.GameVariantCategory),
          teamColor,
        };
      }),
    ],
    [gameModeIconUrl, neatQueueState.matches, neatQueueState.seriesScore, settings.global.ticker.showTabs, teamColors],
  );

  const { showScore, showTeamDetails } = settings.global.display;
  const { showTabs, showTicker } = settings.global.ticker;

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

  const topSection = useMemo(
    () => (
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
    ),
    [iconUrl, neatQueueState.seriesScore, showScore, showTeamDetails, subtitle, teamColors, teamLeft, teamRight, title],
  );

  return (
    <SharedStreamerOverlay
      topSection={topSection}
      teamColors={teamColors}
      tabs={tabs}
      tickerMatchGroups={tickerMatchGroups}
      showTabs={showTabs}
      showTicker={showTicker}
      showPreSeriesInfo={settings.global.ticker.showPreSeriesInfo}
      matchesLength={neatQueueState.matches.length}
      showPreview={settings.global.viewPreview}
      previewMode={settings.global.colors.mode}
      fontSizeStyles={fontSizeStyles}
      settingsUi={settingsUi}
      hasPanelContent={hasPanelContent}
      renderPanelContent={renderPanelContent}
    />
  );
}

export function StreamerOverlay({
  teamColors,
  gameModeIconUrl,
  settings,
  settingsUi,
}: StreamerOverlayProps): React.ReactElement {
  const state = useTrackerState();

  if (state?.type !== "neatqueue") {
    return <div className={styles.overlay}>Streamer overlay is only available for NeatQueue trackers</div>;
  }

  return (
    <NeatQueueStreamerOverlay
      neatQueueState={state}
      teamColors={teamColors}
      gameModeIconUrl={gameModeIconUrl}
      settings={settings}
      settingsUi={settingsUi}
    />
  );
}
