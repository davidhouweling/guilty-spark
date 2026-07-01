import React, { useCallback, useMemo } from "react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { StatsPanel } from "../viewer/stats-panel";
import type {
  IndividualTrackerViewerRenderModel,
  MatchDetailsState,
  ViewerSeriesTab,
  ViewerSeriesTeam,
  ViewerSeriesTeamPlayer,
} from "../viewer/types";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import {
  buildPreSeriesTickerGroup,
  buildTabs,
  buildTickerGroups,
  getActiveSeries,
  getDefaultTeamColors,
  getSelectedTabIndex,
  getShowTabs,
  isPanelOpen as computeIsPanelOpen,
} from "./individual-tracker-overlay-presenter";
import { OverlayStatsHighlights } from "./overlay-stats-highlights";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly streamerSettings: StreamerViewSettings | undefined;
  readonly matchStatsState: MatchStatsState | null;
  readonly matchStatsPanelState: MatchDetailsState | null;
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

interface OverlayDisplaySettings {
  readonly showTicker: boolean;
  readonly showTabs: boolean;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showScore: boolean;
  readonly showTeamDetails: boolean;
  readonly showDiscordNames: boolean;
  readonly showXboxNames: boolean;
}

function getOverlayDisplaySettings(streamerSettings: StreamerViewSettings | undefined): OverlayDisplaySettings {
  const visibleSections = streamerSettings?.visibleSections;
  return {
    showTicker: visibleSections?.showTicker ?? true,
    showTabs: visibleSections?.showTabs ?? true,
    showTitle: visibleSections?.showTitle ?? true,
    showSubtitle: visibleSections?.showSubtitle ?? true,
    showScore: visibleSections?.showScore ?? true,
    showTeamDetails: visibleSections?.showTeamDetails ?? true,
    showDiscordNames: visibleSections?.showDiscordNames ?? true,
    showXboxNames: visibleSections?.showXboxNames ?? true,
  };
}

function getFontSizeStyles(streamerSettings: StreamerViewSettings | undefined): React.CSSProperties {
  const fontSizes = streamerSettings?.layoutOptions?.fontSizes;

  return {
    "--font-size-queue-info": ((fontSizes?.queueInfo ?? 100) / 100).toString(),
    "--font-size-score": ((fontSizes?.score ?? 100) / 100).toString(),
    "--font-size-teams": ((fontSizes?.teams ?? 100) / 100).toString(),
    "--font-size-tabs": ((fontSizes?.tabs ?? 100) / 100).toString(),
    "--font-size-ticker": ((fontSizes?.ticker ?? 100) / 100).toString(),
  } as React.CSSProperties;
}

function getOverlayActiveSeries(renderModel: IndividualTrackerViewerRenderModel): ViewerSeriesTab | null {
  const timelineSeries = getActiveSeries(renderModel.timeline);
  if (timelineSeries != null) {
    return timelineSeries;
  }

  if (!renderModel.hasActiveSeries || renderModel.activeSeriesContext == null) {
    return null;
  }

  return {
    id: "active-series-pre-match",
    title: renderModel.activeSeriesContext.title,
    subtitle: renderModel.activeSeriesContext.subtitle ?? "",
    isActive: true,
    teams: renderModel.activeSeriesContext.teams,
    matchBackgroundUrls: [],
    score: "0:0",
    duration: "unknown",
    startTime: "",
    endTime: "",
    matches: [],
    colorHex: undefined,
  };
}

function getSeriesPlayerDisplayName(player: ViewerSeriesTeamPlayer): string {
  return player.discordName ?? player.gamertag ?? "Unknown";
}

function getSeriesPlayerDisplayNameForSettings(
  player: ViewerSeriesTeamPlayer,
  settings: Pick<OverlayDisplaySettings, "showDiscordNames" | "showXboxNames">,
): string {
  if (settings.showDiscordNames && settings.showXboxNames) {
    return player.discordName ?? player.gamertag ?? "Unknown";
  }

  if (settings.showDiscordNames) {
    return player.discordName ?? "Unknown";
  }

  if (settings.showXboxNames) {
    return player.gamertag ?? "Unknown";
  }

  return getSeriesPlayerDisplayName(player);
}

function renderTeamDetails(
  team: ViewerSeriesTeam,
  settings: Pick<OverlayDisplaySettings, "showDiscordNames" | "showXboxNames">,
): React.ReactElement {
  return (
    <>
      <div>{team.name}</div>
      {team.players.map((player, index) => (
        <div key={`${team.id.toString()}-${index.toString()}`}>
          {getSeriesPlayerDisplayNameForSettings(player, settings)}
        </div>
      ))}
    </>
  );
}

function getTopSectionTeamDetails(
  teams: readonly ViewerSeriesTeam[],
  settings: Pick<OverlayDisplaySettings, "showTeamDetails" | "showDiscordNames" | "showXboxNames">,
): {
  readonly showTeamDetails: boolean;
  readonly teamLeft: React.ReactNode;
  readonly teamRight: React.ReactNode;
} {
  if (!settings.showTeamDetails) {
    return { showTeamDetails: false, teamLeft: null, teamRight: null };
  }

  const teamLeft = teams.find((team) => team.id === 0);
  const teamRight = teams.find((team) => team.id === 1);

  if (teamLeft == null || teamRight == null) {
    return { showTeamDetails: false, teamLeft: null, teamRight: null };
  }

  return {
    showTeamDetails: true,
    teamLeft: renderTeamDetails(teamLeft, settings),
    teamRight: renderTeamDetails(teamRight, settings),
  };
}

export function IndividualTrackerOverlay({
  renderModel,
  streamerSettings,
  matchStatsState,
  matchStatsPanelState,
  selectedMatchId,
  onSelectMatch,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const isPanelOpen = computeIsPanelOpen(selectedMatchId, matchStatsState);
  const displaySettings = useMemo(() => getOverlayDisplaySettings(streamerSettings), [streamerSettings]);
  const fontSizeStyles = useMemo(() => getFontSizeStyles(streamerSettings), [streamerSettings]);

  const teamColors = useMemo(() => {
    if (renderModel.teamColors.length >= 2) {
      return [renderModel.teamColors[0], renderModel.teamColors[1]];
    }

    return getDefaultTeamColors();
  }, [renderModel.teamColors]);

  const activeSeries = useMemo(() => getOverlayActiveSeries(renderModel), [renderModel]);

  const topSection = useMemo(() => {
    if (activeSeries != null) {
      const { showTeamDetails, teamLeft, teamRight } = getTopSectionTeamDetails(activeSeries.teams, displaySettings);

      return (
        <TopSection
          title={displaySettings.showTitle ? activeSeries.title : null}
          subtitle={displaySettings.showSubtitle ? activeSeries.subtitle : null}
          iconUrl={null}
          showScore={displaySettings.showScore}
          seriesScore={activeSeries.score}
          showTeamDetails={showTeamDetails}
          teamColors={teamColors}
          teamLeft={teamLeft}
          teamRight={teamRight}
        />
      );
    }

    if (renderModel.statsHighlights == null || renderModel.statsHighlights.length === 0) {
      return null;
    }

    return <OverlayStatsHighlights items={renderModel.statsHighlights} />;
  }, [activeSeries, displaySettings, teamColors, renderModel.statsHighlights]);

  const tabs = useMemo(() => buildTabs(renderModel.timeline, activeSeries), [activeSeries, renderModel.timeline]);

  const selectedTabIndex = useMemo(() => getSelectedTabIndex(tabs, selectedMatchId), [tabs, selectedMatchId]);

  const tickerMatchGroups = useMemo(() => {
    const loadedGroups = buildTickerGroups(matchStatsState, selectedTabIndex);
    if (loadedGroups.length > 0) {
      return loadedGroups;
    }

    return buildPreSeriesTickerGroup({
      showTicker: displaySettings.showTicker,
      activeSeries,
      playerName: renderModel.gamertag,
      discordName: null,
      gamertag: displaySettings.showXboxNames ? renderModel.gamertag : null,
    });
  }, [
    activeSeries,
    displaySettings.showDiscordNames,
    displaySettings.showTicker,
    displaySettings.showXboxNames,
    matchStatsState,
    renderModel.gamertag,
    selectedTabIndex,
  ]);

  const showPreSeriesInfo = tickerMatchGroups.length > 0 && activeSeries?.matches.length === 0;

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      if (tabIndex < 0) {
        onDeselect();
        return;
      }
      const tab = tabs.find((t) => t.type === "match" && t.index === tabIndex);
      if (tab?.type === "match") {
        if (tab.matchId === selectedMatchId) {
          onDeselect();
        } else {
          onSelectMatch(tab.matchId);
        }
      }
    },
    [onDeselect, onSelectMatch, selectedMatchId, tabs],
  );

  const hasPanelContent = useCallback((): boolean => false, []);

  const renderPanelContent = useCallback(
    (): React.ReactElement | null => <StatsPanel state={matchStatsPanelState} />,
    [matchStatsPanelState],
  );

  return (
    <div
      className={styles.overlayRoot}
      style={
        {
          "--overlay-team-color": teamColors[0].hex,
          "--overlay-enemy-color": teamColors[1].hex,
        } as React.CSSProperties
      }
    >
      <StreamerOverlay
        topSection={topSection}
        pinTopSection={activeSeries != null}
        teamColors={teamColors}
        tabs={tabs}
        tickerMatchGroups={tickerMatchGroups}
        showTabs={displaySettings.showTabs && getShowTabs(renderModel)}
        showTicker={displaySettings.showTicker}
        showPreSeriesInfo={showPreSeriesInfo}
        matchesLength={renderModel.accumulated.total}
        showPreview={false}
        previewMode="observer"
        fontSizeStyles={fontSizeStyles}
        settingsUi={null}
        hasPanelContent={hasPanelContent}
        renderPanelContent={renderPanelContent}
        panelOpen={isPanelOpen}
        onTabClick={handleTabClick}
        onClosePanel={onDeselect}
      />
    </div>
  );
}
