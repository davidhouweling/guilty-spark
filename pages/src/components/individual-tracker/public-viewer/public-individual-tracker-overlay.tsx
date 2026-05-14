import React, { useMemo, useCallback } from "react";
import type { ImageMetadata } from "astro";
import haloEmblemPng from "../../../assets/halo-emblem.png";
import captureTheFlagPng from "../../../assets/game-modes/capture-the-flag.png";
import strongholdsPng from "../../../assets/game-modes/strongholds.png";
import oddballPng from "../../../assets/game-modes/oddball.png";
import slayerPng from "../../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../../assets/game-modes/king-of-the-hill.png";
import assaultPng from "../../../assets/game-modes/assault.png";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { TeamDetailsContent } from "../../streamer-overlay/team-details-content";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { IndividualTrackerViewerMatchCard } from "../types";
import { OverlayTopBarStats } from "./overlay-top-bar-stats";
import type { PublicViewerSnapshot } from "./types";
import styles from "./public-individual-tracker-overlay.module.css";

interface PublicIndividualTrackerOverlayProps {
  readonly snapshot: PublicViewerSnapshot;
}

interface OverlayStyleVars extends React.CSSProperties {
  readonly "--overlay-team-color": string;
  readonly "--overlay-enemy-color": string;
  readonly "--font-size-queue-info": string;
  readonly "--font-size-score": string;
  readonly "--font-size-teams": string;
  readonly "--font-size-tabs": string;
  readonly "--font-size-ticker": string;
}

interface OverlayPlayer {
  readonly id: string;
  readonly displayName: string;
}

function gameModeIconUrl(gameMode: string): ImageMetadata {
  switch (gameMode) {
    case "Capture the Flag": {
      return captureTheFlagPng;
    }
    case "Strongholds": {
      return strongholdsPng;
    }
    case "Oddball": {
      return oddballPng;
    }
    case "King of the Hill": {
      return kingOfTheHillPng;
    }
    case "Neutral Bomb": {
      return assaultPng;
    }
    case "Slayer":
    default: {
      return slayerPng;
    }
  }
}

function getOverlayPlayerLabel(snapshot: PublicViewerSnapshot, player: OverlayPlayer): string {
  const discordName = snapshot.xuidToDiscordName[player.id] ?? "";
  const xboxName = player.displayName;

  if (snapshot.overlayShowDiscordNames && snapshot.overlayShowXboxNames) {
    if (discordName === "" || discordName === xboxName) {
      return xboxName;
    }

    return `${discordName} (${xboxName})`;
  }

  if (snapshot.overlayShowDiscordNames && discordName !== "") {
    return discordName;
  }

  if (snapshot.overlayShowXboxNames) {
    return xboxName;
  }

  return discordName === "" ? xboxName : discordName;
}

function buildTickerGroups(snapshot: PublicViewerSnapshot): readonly TickerMatchGroup[] {
  return snapshot.overlayTickerGroups.map((group) => ({
    matchIndex: group.matchIndex,
    label: group.label,
    rows: group.rows.map((row) => ({
      type: row.type,
      teamId: row.teamId,
      name: row.name,
      stats: row.stats.map((stat) => ({
        name: stat.name,
        value: stat.value,
        bestInTeam: stat.bestInTeam,
        bestInMatch: stat.bestInMatch,
        display: stat.display,
      })),
      medals: row.medals.map((medal) => ({
        name: medal.name,
        count: medal.count,
      })),
    })),
  }));
}

function renderMatchPanel(
  snapshot: PublicViewerSnapshot,
  match: {
    readonly id: string;
    readonly matchStats: IndividualTrackerViewerMatchCard["matchStats"];
    readonly backgroundImageUrl: string;
    readonly gameMode: string;
    readonly matchNumber: number;
    readonly gameTypeAndMap: string;
    readonly duration: string;
    readonly score: string;
    readonly startTime: string;
    readonly endTime: string;
  },
): React.ReactElement | null {
  if (match.matchStats == null) {
    return <p className={styles.emptyPanel}>Match stats unavailable for this game.</p>;
  }

  return (
    <MatchStatsView
      data={match.matchStats}
      id={match.id}
      backgroundImageUrl={match.backgroundImageUrl}
      gameModeIconUrl={gameModeIconUrl(match.gameMode).src}
      gameModeAlt={match.gameMode}
      matchNumber={match.matchNumber}
      gameTypeAndMap={match.gameTypeAndMap}
      duration={match.duration}
      score={match.score}
      startTime={match.startTime}
      endTime={match.endTime}
      teamColors={snapshot.renderModel?.teamColors ?? []}
    />
  );
}

function renderTimelinePanel(snapshot: PublicViewerSnapshot, timelineIndex: number): React.ReactElement | null {
  const timeline = snapshot.renderModel?.gameplayTimeline ?? [];
  const item = timeline.at(timelineIndex);
  if (item == null) {
    return <p className={styles.emptyPanel}>Waiting for tracked gameplay timeline...</p>;
  }

  if (item.type === "group") {
    if (item.seriesTotals == null) {
      return <p className={styles.emptyPanel}>Series totals are still loading.</p>;
    }

    return (
      <SeriesStats
        teamData={item.seriesTotals.teamData}
        playerData={item.seriesTotals.playerData}
        title="Series Totals"
        metadata={item.seriesTotals.metadata}
        teamColors={snapshot.renderModel?.teamColors ?? []}
      />
    );
  }

  return renderMatchPanel(snapshot, item.match);
}

function renderAccumulatedStatsPanel(snapshot: PublicViewerSnapshot): React.ReactElement | null {
  const totals = snapshot.renderModel?.trackedPlayerTotals;
  if (totals == null || snapshot.renderModel == null) {
    return <p className={styles.emptyPanel}>No accumulated stats available yet.</p>;
  }

  return (
    <SeriesStats
      teamData={totals.teamData}
      playerData={totals.playerData}
      title={totals.title}
      metadata={totals.metadata}
      teamColors={snapshot.renderModel.teamColors}
      showHeader={false}
      showSectionHeaders={false}
      highlightBestStats={false}
      omitStatKeys={["team", "gamertag"]}
    />
  );
}

export function PublicIndividualTrackerOverlay({ snapshot }: PublicIndividualTrackerOverlayProps): React.ReactElement {
  const isInactive = snapshot.availability === "offline" || snapshot.availability === "not-found";
  if (isInactive) {
    return (
      <section className={styles.overlayRoot}>
        <div className={styles.minimalMark} aria-label="Guilty Spark overlay mark">
          Guilty Spark
        </div>
      </section>
    );
  }

  const teamColors = useMemo(
    () => [getTeamColorOrDefault(snapshot.viewerTeamColor, 0), getTeamColorOrDefault(snapshot.viewerEnemyColor, 1)],
    [snapshot.viewerEnemyColor, snapshot.viewerTeamColor],
  );

  const hasSeriesContext = snapshot.overlayHasSeriesContext;
  const seriesMatches = snapshot.overlaySeriesMatches;
  const seriesTeams = snapshot.overlaySeriesTeams;
  const timelineTabIndexes = snapshot.overlayTimelineTabIndexes;
  const hasRenderableSeriesTeams = snapshot.overlayShowTeamDetails && seriesTeams.length >= 2;
  const leftSeriesTeam = hasRenderableSeriesTeams ? seriesTeams[0] : undefined;
  const rightSeriesTeam = hasRenderableSeriesTeams ? seriesTeams[1] : undefined;
  const haloEmblemUrl = typeof haloEmblemPng === "string" ? haloEmblemPng : haloEmblemPng.src;

  const topSection = hasSeriesContext ? (
    <TopSection
      title={
        snapshot.overlayShowTitle
          ? (snapshot.overlaySeriesTitle ?? snapshot.trackerState?.gamertag ?? "Guilty Spark")
          : null
      }
      subtitle={snapshot.overlayShowSubtitle ? snapshot.overlaySeriesSubtitle : null}
      iconUrl={haloEmblemUrl}
      showScore={snapshot.overlayShowScore}
      showTeamDetails={hasRenderableSeriesTeams}
      seriesScore={snapshot.overlaySeriesScore}
      teamColors={teamColors}
      teamLeft={
        leftSeriesTeam != null ? (
          <TeamDetailsContent
            team={leftSeriesTeam}
            teamName={leftSeriesTeam.name}
            disableTeamPlayerNames={false}
            renderPlayerNameContent={(playerId, displayName) => (
              <>{getOverlayPlayerLabel(snapshot, { id: playerId, displayName })}</>
            )}
          />
        ) : null
      }
      teamRight={
        rightSeriesTeam != null ? (
          <TeamDetailsContent
            team={rightSeriesTeam}
            teamName={rightSeriesTeam.name}
            disableTeamPlayerNames={false}
            renderPlayerNameContent={(playerId, displayName) => (
              <>{getOverlayPlayerLabel(snapshot, { id: playerId, displayName })}</>
            )}
          />
        ) : null
      }
    />
  ) : (
    <OverlayTopBarStats items={snapshot.overlayTopBarStats} />
  );

  const sharedTabs = snapshot.overlaySharedTabs;

  const hasPanelContent = useCallback(
    (selectedTab: number): boolean => {
      if (selectedTab === -1) {
        return true;
      }

      if (hasSeriesContext) {
        return selectedTab >= 0 && selectedTab < seriesMatches.length;
      }

      if (selectedTab < 0 || selectedTab >= timelineTabIndexes.length) {
        return false;
      }

      const timelineIndex = timelineTabIndexes.at(selectedTab);
      if (timelineIndex == null) {
        return false;
      }

      return snapshot.renderModel?.gameplayTimeline[timelineIndex] != null;
    },
    [hasSeriesContext, seriesMatches, snapshot.renderModel?.gameplayTimeline, timelineTabIndexes],
  );

  const renderPanelContent = useCallback(
    (selectedTab: number): React.ReactElement | null => {
      if (selectedTab === -1) {
        return renderAccumulatedStatsPanel(snapshot);
      }

      if (hasSeriesContext) {
        if (selectedTab < 0 || selectedTab >= seriesMatches.length) {
          return <p className={styles.emptyPanel}>No tracked details available for this tab.</p>;
        }

        const seriesMatch = seriesMatches.at(selectedTab);
        if (seriesMatch == null) {
          return <p className={styles.emptyPanel}>No tracked details available for this tab.</p>;
        }

        return renderMatchPanel(snapshot, seriesMatch);
      }

      if (selectedTab < 0 || selectedTab >= timelineTabIndexes.length) {
        return <p className={styles.emptyPanel}>No tracked details available for this tab.</p>;
      }

      const timelineIndex = timelineTabIndexes.at(selectedTab);
      if (timelineIndex == null) {
        return <p className={styles.emptyPanel}>No tracked details available for this tab.</p>;
      }

      return renderTimelinePanel(snapshot, timelineIndex);
    },
    [hasSeriesContext, seriesMatches, snapshot, timelineTabIndexes],
  );

  const cssVariables: OverlayStyleVars = {
    "--overlay-team-color": `var(--team-color-${snapshot.viewerTeamColor}, var(--halo-green))`,
    "--overlay-enemy-color": `var(--team-color-${snapshot.viewerEnemyColor}, var(--halo-red))`,
    "--font-size-queue-info": (snapshot.overlayFontSizes.queueInfo / 100).toString(),
    "--font-size-score": (snapshot.overlayFontSizes.score / 100).toString(),
    "--font-size-teams": (snapshot.overlayFontSizes.teams / 100).toString(),
    "--font-size-tabs": (snapshot.overlayFontSizes.tabs / 100).toString(),
    "--font-size-ticker": (snapshot.overlayFontSizes.ticker / 100).toString(),
  };

  return (
    <section className={styles.overlayRoot}>
      <StreamerOverlay
        topSection={topSection}
        pinTopSection={!hasSeriesContext}
        teamColors={teamColors}
        tabs={sharedTabs}
        tickerMatchGroups={buildTickerGroups(snapshot)}
        showTabs={snapshot.overlayShowTabs}
        showTicker={snapshot.overlayShowTicker}
        showPreSeriesInfo={snapshot.overlayShowPreSeriesInfo}
        matchesLength={hasSeriesContext ? seriesMatches.length : timelineTabIndexes.length}
        showPreview={snapshot.overlayViewPreview}
        previewMode={snapshot.overlayColorMode}
        fontSizeStyles={cssVariables}
        settingsUi={null}
        hasPanelContent={hasPanelContent}
        renderPanelContent={renderPanelContent}
      />
    </section>
  );
}
