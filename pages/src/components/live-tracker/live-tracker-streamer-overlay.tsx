import React, { useMemo, useCallback } from "react";
import { getRankTierFromCsr } from "@guilty-spark/shared/halo/rank";
import TimeAgo from "javascript-time-ago";
import { differenceInHours } from "date-fns";
import type { TickerMatchGroup, TickerStatRow } from "../information-ticker/information-ticker";
import type { TeamColor } from "../team-colors/team-colors";
import { RankIcon } from "../icons/rank-icon";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
import discordLogo from "../../assets/discord-logo.png";
import xboxLogo from "../../assets/xbox-logo.png";
import { StreamerOverlay } from "../streamer-overlay/streamer-overlay";
import { TopSection } from "../streamer-overlay/top-section";
import { TeamDetailsContent } from "../streamer-overlay/team-details-content";
import type { OverlayTab } from "../streamer-overlay/tabs-bar";
import overlayStyles from "../streamer-overlay/streamer-overlay.module.css";
import { ALL_SLAYER_STATS, type AllStreamerSettings } from "./settings/types";
import { useTrackerState, useAllMatchStats, useSeriesStats, useTrackerInfo } from "./live-tracker-context";
import type { LiveTrackerNeatQueueStateRenderModel } from "./types";
import "javascript-time-ago/locale/en";

export interface LiveTrackerStreamerOverlayProps {
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly settings: AllStreamerSettings;
  readonly settingsUi: React.ReactNode;
}

interface OverlayFontSizeStyles extends React.CSSProperties {
  readonly "--font-size-queue-info": string;
  readonly "--font-size-score": string;
  readonly "--font-size-teams": string;
  readonly "--font-size-tabs": string;
  readonly "--font-size-ticker": string;
}

export function LiveTrackerStreamerOverlay({
  teamColors,
  gameModeIconUrl,
  settings,
  settingsUi,
}: LiveTrackerStreamerOverlayProps): React.ReactElement {
  const trackerInfo = useTrackerInfo();
  const state = useTrackerState();
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();
  const timeAgo = useMemo(() => new TimeAgo("en"), []);

  if (state?.type !== "neatqueue") {
    return <div className={overlayStyles.overlay}>Streamer overlay is only available for NeatQueue trackers</div>;
  }

  const neatQueueState: LiveTrackerNeatQueueStateRenderModel = state;

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

    const medalWeights = new Map(Object.values(state.medalMetadata).map((medal) => [medal.name, medal.sortingWeight]));

    const difficultyRange = new Map<number, readonly [number, number]>([
      [0, [0, 99]],
      [1, [100, 149]],
      [2, [150, 199]],
      [3, [200, Number.POSITIVE_INFINITY]],
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

    if (
      settings.global.ticker.showPreSeriesInfo &&
      neatQueueState.matches.length === 0 &&
      neatQueueState.playersAssociationData != null
    ) {
      const playersAssociationData = new Map(Object.entries(neatQueueState.playersAssociationData));
      const rows: TickerStatRow[] = [];

      for (const [teamIndex, team] of neatQueueState.teams.entries()) {
        for (const player of team.players) {
          const playerData = playersAssociationData.get(player.id);
          if (playerData == null) {
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
              name: "Peak rank",
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
              name: "Peak rank",
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "-",
            });
          }

          if (playerData.esra !== null) {
            const { rankTier, subTier } = getRankTierFromCsr(playerData.esra);
            playerStats.push({
              name: "ESRA",
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
              name: "ESRA",
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

    if (seriesStats != null && seriesStats.teamData.length > 0) {
      const rows: TickerStatRow[] = [];

      for (const teamData of seriesStats.teamData.values()) {
        const { teamId, teamStats, teamMedals } = teamData;
        const { eagleTeamNameOverride, cobraTeamNameOverride } = settings.series;
        const teamOverride = teamId === 0 ? eagleTeamNameOverride : cobraTeamNameOverride;

        let teamName = teamId === 0 ? "Eagle" : "Cobra";
        if (teamOverride !== null && teamOverride !== "") {
          teamName = teamOverride;
        } else if (teamId >= 0 && teamId < neatQueueState.teams.length) {
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

      for (const teamData of seriesStats.playerData) {
        for (const player of teamData.players) {
          rows.push({
            type: "player",
            teamId: teamData.teamId,
            name: player.name,
            stats: filterStats(player.values),
            medals: filterMedals(player.medals),
          });
        }
      }

      groups.push({ matchIndex: -1, label: "Series Stats", rows });
    }

    for (const [matchIndex, matchStat] of allMatchStats.entries()) {
      if (matchStat.data == null) {
        continue;
      }

      const rows: TickerStatRow[] = [];

      for (const teamData of matchStat.data) {
        const { teamId, teamStats, teamMedals } = teamData;
        const { eagleTeamNameOverride, cobraTeamNameOverride } = settings.series;
        const teamOverride = teamId === 0 ? eagleTeamNameOverride : cobraTeamNameOverride;

        let teamName = teamId === 0 ? "Eagle" : "Cobra";
        if (teamOverride !== null && teamOverride !== "") {
          teamName = teamOverride;
        } else if (teamId >= 0 && teamId < neatQueueState.teams.length) {
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

      for (const teamData of matchStat.data) {
        for (const player of teamData.players) {
          rows.push({
            type: "player",
            teamId: teamData.teamId,
            name: player.name,
            stats: filterStats(player.values),
            medals: filterMedals(player.medals),
          });
        }
      }

      if (matchIndex >= 0 && matchIndex < neatQueueState.matches.length) {
        const matchModel = neatQueueState.matches[matchIndex];
        groups.push({ matchIndex, label: matchModel.gameTypeAndMap, rows });
      }
    }

    return groups;
  }, [
    allMatchStats,
    neatQueueState.matches,
    neatQueueState.playersAssociationData,
    neatQueueState.teams,
    seriesStats,
    settings.global.ticker.medalRarityFilter,
    settings.global.ticker.selectedSlayerStats,
    settings.global.ticker.showObjectiveStats,
    settings.global.ticker.showPreSeriesInfo,
    settings.series.cobraTeamNameOverride,
    settings.series.eagleTeamNameOverride,
    state.medalMetadata,
    timeAgo,
  ]);

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
              <img src={discordLogo.src} alt="Discord" className={overlayStyles.playerIcon} />
              <img src={xboxLogo.src} alt="Xbox" className={overlayStyles.playerIcon} /> {gamertag}
            </>
          );
        }

        return (
          <>
            <img src={discordLogo.src} alt="Discord" className={overlayStyles.playerIcon} /> {discordName}
            {gamertag != null && (
              <>
                {" "}
                <img src={xboxLogo.src} alt="Xbox" className={overlayStyles.playerIcon} /> {gamertag}
              </>
            )}
          </>
        );
      }

      if (showDiscord) {
        return (
          <>
            <img src={discordLogo.src} alt="Discord" className={overlayStyles.playerIcon} /> {discordName}
          </>
        );
      }

      if (showXbox && gamertag !== null && gamertag !== "") {
        return (
          <>
            <img src={xboxLogo.src} alt="Xbox" className={overlayStyles.playerIcon} /> {gamertag}
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
    () => (
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
    () => (
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
        type: "series",
        index: -1,
        label: "Series score",
        score: neatQueueState.seriesScore,
        teamColor: undefined,
      },
      ...neatQueueState.matches.map((match, index): OverlayTab => {
        let winningTeamIndex: number | null = null;
        if (match.rawMatchStats != null) {
          const winningTeam = match.rawMatchStats.Teams.find((team) => team.Outcome === 2);
          if (winningTeam != null) {
            winningTeamIndex = match.rawMatchStats.Teams.indexOf(winningTeam);
          }
        }

        return {
          type: "match",
          index,
          matchId: match.matchId,
          label: settings.global.ticker.showTabs ? match.gameMap : "",
          score: match.gameScore,
          icon: gameModeIconUrl(match.gameType),
          teamColor: winningTeamIndex !== null ? teamColors[winningTeamIndex]?.hex : undefined,
        };
      }),
    ],
    [gameModeIconUrl, neatQueueState.matches, neatQueueState.seriesScore, settings.global.ticker.showTabs, teamColors],
  );

  const fontSizeStyles: OverlayFontSizeStyles = {
    "--font-size-queue-info": (settings.global.fontSizes.queueInfo / 100).toString(),
    "--font-size-score": (settings.global.fontSizes.score / 100).toString(),
    "--font-size-teams": (settings.global.fontSizes.teams / 100).toString(),
    "--font-size-tabs": (settings.global.fontSizes.tabs / 100).toString(),
    "--font-size-ticker": (settings.global.fontSizes.ticker / 100).toString(),
  };

  const hasPanelContent = useCallback(
    (tabIndex: number): boolean => {
      if (tabIndex === -1) {
        if (neatQueueState.matches.length === 0) {
          return neatQueueState.playersAssociationData != null;
        }

        return seriesStats != null;
      }

      return (
        tabIndex >= 0 &&
        tabIndex < allMatchStats.length &&
        tabIndex < neatQueueState.matches.length &&
        allMatchStats[tabIndex].data != null
      );
    },
    [allMatchStats, neatQueueState.matches, neatQueueState.playersAssociationData, seriesStats],
  );

  const renderPanelContent = useCallback(
    (tabIndex: number): React.ReactElement | null => {
      if (tabIndex === -1) {
        if (neatQueueState.matches.length === 0 && neatQueueState.playersAssociationData != null) {
          return (
            <PlayerPreSeriesInfo
              teams={neatQueueState.teams}
              playersAssociationData={neatQueueState.playersAssociationData}
              teamColors={teamColors}
            />
          );
        }

        if (seriesStats != null && neatQueueState.matches.length > 0) {
          return (
            <SeriesStats
              teamData={seriesStats.teamData}
              playerData={seriesStats.playerData}
              title="Series Totals"
              metadata={seriesStats.metadata}
              teamColors={teamColors}
            />
          );
        }

        return null;
      }

      if (tabIndex < 0 || tabIndex >= allMatchStats.length || tabIndex >= neatQueueState.matches.length) {
        return null;
      }

      const selectedMatchStats = allMatchStats[tabIndex].data;
      const selectedMatch = neatQueueState.matches[tabIndex];
      if (selectedMatchStats == null) {
        return null;
      }

      return (
        <MatchStatsView
          data={selectedMatchStats}
          id={selectedMatch.matchId}
          backgroundImageUrl={selectedMatch.gameMapThumbnailUrl}
          gameModeIconUrl={gameModeIconUrl(selectedMatch.gameType)}
          gameModeAlt={selectedMatch.gameType}
          matchNumber={tabIndex + 1}
          gameTypeAndMap={selectedMatch.gameTypeAndMap}
          duration={selectedMatch.duration}
          score={selectedMatch.gameScore}
          startTime={selectedMatch.startTime}
          endTime={selectedMatch.endTime}
          teamColors={teamColors}
        />
      );
    },
    [
      allMatchStats,
      gameModeIconUrl,
      neatQueueState.matches,
      neatQueueState.playersAssociationData,
      neatQueueState.teams,
      seriesStats,
      teamColors,
    ],
  );

  return (
    <StreamerOverlay
      topSection={
        <TopSection
          title={title}
          subtitle={subtitle}
          iconUrl={iconUrl}
          showScore={settings.global.display.showScore}
          showTeamDetails={settings.global.display.showTeamDetails}
          seriesScore={neatQueueState.seriesScore}
          teamColors={teamColors}
          teamLeft={teamLeft}
          teamRight={teamRight}
        />
      }
      teamColors={teamColors}
      tabs={tabs}
      tickerMatchGroups={tickerMatchGroups}
      showTabs={settings.global.ticker.showTabs}
      showTicker={settings.global.ticker.showTicker}
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
