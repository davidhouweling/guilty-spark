import React, { useState, useEffect, useCallback, useMemo } from "react";
import ReactTimeAgo from "react-time-ago";
import classNames from "classnames";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { ComponentLoaderStatus } from "../component-loader/component-loader";
import type { ViewMode } from "../view-mode/view-mode-selector";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault } from "../team-colors/team-colors";
import { gameModeIconSrc as gameModeIconFromVariantCategory } from "../individual-tracker/game-mode-icon";
import { SeriesOverview } from "../series-overview/series-overview";
import type { SeriesOverviewMatch, SeriesOverviewTeam } from "../series-overview/types";
import { createSeriesStatsContent } from "../series-stats/create";
import { SettingsTrigger } from "./settings/settings-trigger";
import { SettingsDialog } from "./settings/settings-dialog";
import { useStreamerSettings } from "./settings/use-streamer-settings";
import { DEFAULT_VIEW_MODE } from "./settings/types";
import { StreamerOverlay } from "./streamer-overlay/streamer-overlay";
import {
  useTrackerInfo,
  useTrackerState,
  useHasMatches,
  useSubstitutions,
  useMatchSubstitutions,
  useAvailablePlayers,
  useSeriesDetailActions,
  useSeriesDetailState,
} from "./live-tracker-context";
import type { LiveTrackerStateRenderModel, LiveTrackerViewModel } from "./types";
import styles from "./live-tracker.module.css";
import { buildUrlWithSettings, parseSettingsFromUrl } from "./settings/settings-url-params";

function hasState(state: LiveTrackerStateRenderModel | null): state is LiveTrackerStateRenderModel {
  return state !== null;
}

function emojifySeriesScore(seriesScore: string): string {
  const teamScores = seriesScore.split(":").map((s) => s.trim());
  if (teamScores.length !== 2) {
    return seriesScore;
  }
  return `🦅${teamScores[0]}:${teamScores[1]}🐍`;
}

function gameModeIconSrc(_gameMode: string, gameVariantCategory?: number): string {
  return gameModeIconFromVariantCategory(gameVariantCategory ?? 0);
}

function toLiveSeriesOverviewMatches(
  state: LiveTrackerStateRenderModel,
  detailMatches: LiveTrackerViewModel["detailViewModel"],
): readonly SeriesOverviewMatch[] {
  const winners = new Map(
    detailMatches?.matchSummaries.map((summary) => [summary.matchId, summary.winningTeamColorHex]) ?? [],
  );
  const playedMatches = state.matches.map((match) => {
    return {
      id: match.matchId,
      href: `#${match.matchId}`,
      mapBackgroundUrl: match.gameMapThumbnailUrl,
      teamColorHex: winners.get(match.matchId) ?? undefined,
      gameModeIconUrl: gameModeIconSrc(match.gameType, match.gameInfo?.gameVariantCategory),
      gameModeAlt: match.gameType,
      score: match.gameScore,
      subScore: match.gameSubScore,
      mapLabel: match.gameMap,
      isUpcoming: false,
    };
  });
  const upcomingMatches = state.plannedGames.map((match) => ({
    id: `planned-${match.gameNumber.toString()}`,
    mapBackgroundUrl: match.gameMapThumbnailUrl,
    gameModeIconUrl: match.gameModeIconUrl,
    gameModeAlt: "",
    score: null,
    subScore: null,
    mapLabel: `${match.mode}: ${match.map}`,
    isUpcoming: true,
  }));

  return [...playedMatches, ...upcomingMatches];
}

function toLiveSeriesOverviewTeams(
  state: LiveTrackerStateRenderModel,
  team1Color: string,
  team2Color: string,
): readonly SeriesOverviewTeam[] {
  return state.teams.map((team, teamIndex) => {
    const teamColorId = teamIndex === 0 ? team1Color : team2Color;
    const teamColor = getTeamColorOrDefault(teamIndex < 2 ? teamColorId : undefined, teamIndex);

    return {
      id: `${teamIndex.toString()}:${team.name}`,
      name: team.name,
      teamColorHex: teamColor.hex,
      players: team.players.map((player) => {
        const playerData = state.playersAssociationData?.[player.id];
        return {
          id: player.id,
          discordName: playerData?.discordName ?? player.displayName,
          gamertag: playerData?.gamertag ?? null,
        };
      }),
    };
  });
}

function substitutionNotice(
  substitution: LiveTrackerViewModel["sortedSubstitutions"][number],
  className: string,
): React.ReactElement {
  return (
    <Container key={substitution.timestamp} className={className}>
      <Alert variant="info" icon="↔️">
        <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
        <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
      </Alert>
    </Container>
  );
}

export function LiveTrackerView(): React.ReactElement {
  // Use selector hooks to get data from context
  const trackerInfo = useTrackerInfo();
  const state = useTrackerState();
  const hasMatches = useHasMatches();
  const sortedSubstitutionsList = useSubstitutions();
  const matchSubstitutions = useMatchSubstitutions();
  const availablePlayers = useAvailablePlayers();
  const detailState = useSeriesDetailState();
  const { onAnalyticsTabSelected, onRetrySeriesDetails } = useSeriesDetailActions();
  const SeriesStatsContent = useMemo(() => createSeriesStatsContent(), []);

  const { settings, setSettings } = useStreamerSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [team1Color, setTeam1Color] = useState(DEFAULT_TEAM_COLORS[0]);
  const [team2Color, setTeam2Color] = useState(DEFAULT_TEAM_COLORS[1]);

  // State for view mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    if (typeof window !== "undefined") {
      return parseSettingsFromUrl(urlSearchParams, settings).global.viewMode;
    }
    return DEFAULT_VIEW_MODE;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const urlSettings = parseSettingsFromUrl(new URLSearchParams(window.location.search), settings);
    setSettings(urlSettings);
    setViewMode(urlSettings.global.viewMode);
  }, [setSettings]); // settings is intentionally omitted from deps: we only want to apply URL params once on mount using the initial localStorage value

  function updateUrl(currentViewMode: ViewMode): void {
    if (typeof window !== "undefined") {
      window.history.replaceState(
        {},
        "",
        buildUrlWithSettings({ baseUrl: window.location.href, settings, viewMode: currentViewMode }),
      );
    }
  }

  // Sync team colors based on player/observer view settings
  useEffect(() => {
    if (!hasState(state)) {
      return;
    }

    const colorMode = settings.global.colors.mode;

    if (colorMode === "player") {
      // Player view mode - determine which team the selected player is on
      const { selectedPlayerId, teamColor, enemyColor } = settings.global.colors.playerView;

      if (selectedPlayerId !== null && selectedPlayerId !== "") {
        // Find which team the selected player is on
        let playerTeamIndex = -1;
        for (let i = 0; i < state.teams.length; i++) {
          if (state.teams[i].players.some((p) => p.id === selectedPlayerId)) {
            playerTeamIndex = i;
            break;
          }
        }

        if (playerTeamIndex === 0) {
          if (team1Color !== teamColor || team2Color !== enemyColor) {
            setTeam1Color(teamColor);
            setTeam2Color(enemyColor);
          }
          return;
        } else if (playerTeamIndex === 1) {
          if (team2Color !== teamColor || team1Color !== enemyColor) {
            setTeam1Color(enemyColor);
            setTeam2Color(teamColor);
          }
          return;
        }
      }
    }

    // Observer view mode / fallback - apply fixed team colors
    const { eagleColor, cobraColor } = settings.global.colors.observerView;

    // Only update if colors have changed to avoid unnecessary updates
    if (team1Color !== eagleColor || team2Color !== cobraColor) {
      setTeam1Color(eagleColor);
      setTeam2Color(cobraColor);
    }
  }, [state, settings.global.colors]);

  const handleSetViewMode = useCallback((mode: ViewMode): void => {
    setViewMode(mode);
    updateUrl(mode);
  }, []);

  const displayTitle =
    settings.series.titleOverride !== null && settings.series.titleOverride !== ""
      ? settings.series.titleOverride
      : trackerInfo.title;

  const displaySubtitle =
    settings.series.subtitleOverride !== null && settings.series.subtitleOverride !== ""
      ? settings.series.subtitleOverride
      : trackerInfo.subtitle;

  const queueTitle = hasState(state)
    ? `Queue #${state.queueNumber.toString()} Live Tracker`
    : displaySubtitle !== ""
      ? `${displaySubtitle} Live Tracker`
      : "Live Tracker";

  const pageSubtitle = displayTitle;

  // Set body data attribute for streamer mode styling
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-view-mode", viewMode);
    }

    return (): void => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-view-mode");
      }
    };
  }, [viewMode]);

  const title: string[] = [];
  if (hasState(state)) {
    title.push(`Queue #${state.queueNumber.toString()}`);
    title.push(`(${emojifySeriesScore(state.seriesScore)})`);
  }
  if (displayTitle !== "") {
    title.push("|");
    title.push(displayTitle);
  }
  title.push("Live Tracker - Guilty Spark");

  const teamColorsArray = [getTeamColorOrDefault(team1Color, 0), getTeamColorOrDefault(team2Color, 1)];
  const seriesOverviewMatches = hasState(state) ? toLiveSeriesOverviewMatches(state, detailState.detailViewModel) : [];
  const seriesOverviewTeams = hasState(state) ? toLiveSeriesOverviewTeams(state, team1Color, team2Color) : [];

  const settingsTrigger = (
    <SettingsTrigger
      compact={viewMode === "streamer"}
      onClick={(): void => {
        setIsSettingsOpen(true);
      }}
    />
  );

  const settingsDialog = (
    <SettingsDialog
      isOpen={isSettingsOpen}
      settings={settings}
      viewMode={viewMode}
      availablePlayers={availablePlayers}
      defaultTitle={state?.guildName}
      defaultSubtitle={state != null ? `Queue #${state.queueNumber.toString()}` : undefined}
      server={state?.guildId}
      queue={state?.queueNumber}
      onClose={(): void => {
        setIsSettingsOpen(false);
      }}
      onSettingsChange={setSettings}
      onViewModeChange={handleSetViewMode}
      onViewPreviewChange={(enabled): void => {
        setSettings({
          ...settings,
          global: {
            ...settings.global,
            viewPreview: enabled,
          },
        });
      }}
    />
  );

  const settingsUi = (
    <>
      {settingsTrigger}
      {settingsDialog}
    </>
  );

  const statsGutter = viewMode === "wide" ? "0" : undefined;
  const contentClassName = classNames(styles.contentContainer, styles[viewMode]);
  const beforeMatchContent = new Map<string, React.ReactNode>();
  for (const [matchId, notices] of matchSubstitutions.byMatchId) {
    beforeMatchContent.set(matchId, <>{notices.map((notice) => substitutionNotice(notice, contentClassName))}</>);
  }
  const afterMatchesContent = (
    <>{matchSubstitutions.trailing.map((notice) => substitutionNotice(notice, contentClassName))}</>
  );

  // Render streamer overlay if in streamer mode
  if (viewMode === "streamer" && state) {
    return (
      <>
        <title>{title.join(" ")}</title>
        <StreamerOverlay
          teamColors={teamColorsArray}
          gameModeIconUrl={gameModeIconSrc}
          settings={settings}
          settingsUi={settingsUi}
        />
      </>
    );
  }

  return (
    <>
      <title>{title.join(" ")}</title>
      <Container className={classNames(styles.pageHeader, styles.contentContainer, styles[viewMode])}>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <Heading tagName="h1" styleAs="h3">
              {queueTitle}
            </Heading>
            <div className={styles.headerSubtitle}>{pageSubtitle}</div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.headerMetaRow}>
              <span className={styles.headerMetaLabel}>Last updated</span>
              <span className={styles.headerMetaValue}>
                {state ? <ReactTimeAgo date={new Date(state.lastUpdateTime)} locale="en" /> : "-"}
              </span>
            </div>
            <div className={styles.headerMetaRow}>
              <span className={styles.headerMetaLabel}>Status</span>
              <span id="status-text" className={classNames(styles.headerMetaValue, trackerInfo.statusClassName)}>
                {trackerInfo.statusText}
              </span>
            </div>
          </div>
        </div>
      </Container>

      <div className={classNames(styles.dataContainer, styles[viewMode])}>
        {settingsDialog}
        {state?.status === "stopped" ? (
          <Container className={classNames(styles.contentContainer, styles[viewMode])}>
            <Alert variant="info">The series has completed. Tracker stopped.</Alert>
          </Container>
        ) : null}

        {state ? (
          <>
            {hasState(state) && (
              <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                <div className={styles.overviewHeader}>
                  <Heading tagName="h2" styleAs="h3">
                    Series overview
                  </Heading>
                  {settingsTrigger}
                </div>
                <SeriesOverview
                  score={state.seriesScore}
                  matches={seriesOverviewMatches}
                  teams={seriesOverviewTeams}
                  waitingMessage={hasMatches ? undefined : "Waiting for first match to complete..."}
                />
              </Container>
            )}
            {hasState(state) && hasMatches && (
              <Container
                mobileDown="0"
                tabletUp={statsGutter}
                desktopUp={statsGutter}
                ultrawideUp={statsGutter}
                className={contentClassName}
              >
                {detailState.seriesDetail != null ? (
                  <>
                    {detailState.seriesDetailStatus === ComponentLoaderStatus.ERROR ? (
                      <ErrorState
                        message={detailState.seriesDetailError ?? "Unable to load series stats"}
                        onRetry={onRetrySeriesDetails}
                      />
                    ) : null}
                    <SeriesStatsContent
                      data={detailState.seriesDetail}
                      analyticsByMatchId={detailState.seriesAnalyticsByMatchId}
                      showSeriesTitle={true}
                      showSeriesOverview={false}
                      noGutter={viewMode === "wide"}
                      wide={false}
                      teamColors={teamColorsArray}
                      beforeMatchContent={beforeMatchContent}
                      afterMatchesContent={afterMatchesContent}
                      onAnalyticsTabSelected={onAnalyticsTabSelected}
                    />
                  </>
                ) : detailState.seriesDetailStatus === ComponentLoaderStatus.ERROR ? (
                  <ErrorState
                    message={detailState.seriesDetailError ?? "Unable to load series stats"}
                    onRetry={onRetrySeriesDetails}
                  />
                ) : detailState.seriesDetailStatus !== ComponentLoaderStatus.LOADED ? (
                  <LoadingState text="Loading match details..." />
                ) : (
                  <Alert variant="warning">Series details are unavailable.</Alert>
                )}
              </Container>
            )}
            {hasState(state) && !hasMatches && state.playersAssociationData && (
              <PlayerPreSeriesInfo
                className={classNames(styles.contentContainer, styles[viewMode])}
                teams={state.teams}
                playersAssociationData={state.playersAssociationData}
                teamColors={teamColorsArray}
              />
            )}
            {hasState(state) && !hasMatches && sortedSubstitutionsList.length > 0 && (
              <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                {sortedSubstitutionsList.map((substitution) => (
                  <Alert key={substitution.timestamp} variant="info" icon="↔️">
                    <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                    <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                  </Alert>
                ))}
              </Container>
            )}
          </>
        ) : (
          <Container className={classNames(styles.contentContainer, styles[viewMode])}>
            <Alert variant="info">{trackerInfo.statusText}</Alert>
          </Container>
        )}
      </div>
    </>
  );
}
