import React, { useMemo, useState, useEffect, useCallback } from "react";
import ReactTimeAgo from "react-time-ago";
import classNames from "classnames";
import { compareAsc } from "date-fns";
import type { ImageMetadata } from "astro";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { SeriesTeamStatsPresenter } from "../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../stats/series-player-stats-presenter";
import { calculateSeriesMetadata, type SeriesMetadata } from "../stats/series-metadata";
import type { MatchStatsData } from "../stats/types";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import type { ViewMode } from "../view-mode/view-mode-selector";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
import { PlayerName } from "../player-name/player-name";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault } from "../team-colors/team-colors";
import { SettingsTrigger } from "./settings/settings-trigger";
import { SettingsDialog } from "./settings/settings-dialog";
import { useStreamerSettings } from "./settings/use-streamer-settings";
import { IndividualModeMatches } from "./individual-mode-matches";
import { StreamerOverlay } from "./streamer-overlay";
import {
  useTrackerInfo,
  useTrackerState,
  useTrackerParams,
  useAllMatchStats,
  useSeriesStats,
  useHasMatches,
  useSubstitutions,
} from "./live-tracker-context";
import type {
  LiveTrackerStateRenderModel,
  LiveTrackerNeatQueueStateRenderModel,
  LiveTrackerIndividualStateRenderModel,
} from "./types";
import styles from "./live-tracker.module.css";
import { buildUrlWithSettings, parseSettingsFromUrl } from "./settings/settings-url-params";

function isNeatQueueState(state: LiveTrackerStateRenderModel | null): state is LiveTrackerNeatQueueStateRenderModel {
  return state !== null && state.type === "neatqueue";
}

function isIndividualState(state: LiveTrackerStateRenderModel | null): state is LiveTrackerIndividualStateRenderModel {
  return state !== null && state.type === "individual";
}

function gameModeIconUrl(gameMode: string): ImageMetadata {
  // todo: resolve the rest of the game modes
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

function emojifySeriesScore(seriesScore: string): string {
  const teamScores = seriesScore.split(":").map((s) => s.trim());
  if (teamScores.length !== 2) {
    return seriesScore;
  }
  return `🦅${teamScores[0]}:${teamScores[1]}🐍`;
}

function gameModeIconSrc(gameMode: string): string {
  return gameModeIconUrl(gameMode).src;
}

export function LiveTrackerView(): React.ReactElement {
  // Use selector hooks to get data from context
  const trackerInfo = useTrackerInfo();
  const state = useTrackerState();
  const params = useTrackerParams();
  const hasMatches = useHasMatches();
  const sortedSubstitutions = useSubstitutions();
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();

  const isIndividualMode = params.type === "individual";
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
    return "standard";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const urlSettings = parseSettingsFromUrl(new URLSearchParams(window.location.search), settings);
    setSettings(urlSettings);
    setViewMode(urlSettings.global.viewMode);
  }, [setSettings]); // eslint-disable-line react-hooks/exhaustive-deps -- settings is intentionally the initial value from localStorage

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
    if (!isNeatQueueState(state)) {
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

  // Apply settings overrides for title and subtitle
  const displayTitle = useMemo(
    () =>
      settings.series.titleOverride !== null && settings.series.titleOverride !== ""
        ? settings.series.titleOverride
        : trackerInfo.title,
    [settings.series.titleOverride, trackerInfo.title],
  );

  const displaySubtitle = useMemo(
    () =>
      settings.series.subtitleOverride !== null && settings.series.subtitleOverride !== ""
        ? settings.series.subtitleOverride
        : trackerInfo.subtitle,
    [settings.series.subtitleOverride, trackerInfo.subtitle],
  );

  // Sort substitutions by timestamp for rendering between matches (memoized)
  const sortedSubstitutionsList = useMemo(() => {
    if (!sortedSubstitutions) {
      return [];
    }
    return [...sortedSubstitutions].sort((a, b) => compareAsc(a.timestamp, b.timestamp));
  }, [sortedSubstitutions]);

  // For individual mode, compute stats for each group
  const individualGroupStats = useMemo(() => {
    if (!isIndividualState(state)) {
      return null;
    }

    const statsMap = new Map<
      string,
      { teamData: MatchStatsData[]; playerData: MatchStatsData[]; metadata: SeriesMetadata | null }
    >();

    for (const group of state.groups) {
      if (group.type === "single-match") {
        continue;
      }

      const groupMatches = group.matches;
      const rawMatchStats = groupMatches
        .map((m) => m.rawMatchStats)
        .filter((stats): stats is NonNullable<typeof stats> => stats != null);

      if (!rawMatchStats.length) {
        continue;
      }

      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of groupMatches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      const { seriesScore } = group;
      const metadata = calculateSeriesMetadata(groupMatches, seriesScore);

      const teamPresenter = new SeriesTeamStatsPresenter();
      const playerPresenter = new SeriesPlayerStatsPresenter();

      statsMap.set(group.groupId, {
        teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, state.medalMetadata),
        playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, state.medalMetadata),
        metadata,
      });
    }

    return statsMap;
  }, [state?.type, isIndividualState(state) ? state.groups : null, state?.medalMetadata]);

  // Memoize available players for settings dialog
  const availablePlayers = useMemo(
    () =>
      isNeatQueueState(state)
        ? state.teams.flatMap((team) =>
            team.players.map((player) => ({
              id: player.id,
              name: player.displayName,
            })),
          )
        : [],
    [state],
  );

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

  const title: string[] = [trackerInfo.title];
  if (isIndividualMode) {
    title.push("- Individual Tracker");
  } else if (isNeatQueueState(state)) {
    title.push(`#${state.queueNumber.toString()}`);
    title.push(`(${emojifySeriesScore(state.seriesScore)})`);
  }
  title.push("| Live Tracker - Guilty Spark");

  const teamColorsArray = [getTeamColorOrDefault(team1Color, 0), getTeamColorOrDefault(team2Color, 1)];

  const settingsUi = (
    <>
      <SettingsTrigger
        compact={viewMode === "streamer"}
        onClick={(): void => {
          setIsSettingsOpen(true);
        }}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        settings={settings}
        viewMode={viewMode}
        availablePlayers={availablePlayers}
        defaultTitle={state?.type === "neatqueue" ? state.guildName : undefined}
        defaultSubtitle={state?.type === "neatqueue" ? `Queue #${state.queueNumber.toString()}` : undefined}
        server={isNeatQueueState(state) ? state.guildId : undefined}
        queue={isNeatQueueState(state) ? state.queueNumber : undefined}
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
    </>
  );

  // Render streamer overlay if in streamer mode
  if (viewMode === "streamer" && state && isNeatQueueState(state)) {
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
      <Container>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <h1 className={styles.headerTitle}>{displayTitle}</h1>
            <div className={styles.headerSubtitle}>
              {isIndividualMode
                ? displaySubtitle
                : isNeatQueueState(state)
                  ? `Queue #${state.queueNumber.toString()}`
                  : displaySubtitle}
            </div>
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

      <Container mobileDown="0" className={classNames(styles.dataContainer, styles.contentContainer, styles[viewMode])}>
        {settingsUi}
        {state?.status === "stopped" ? (
          <Container className={classNames(styles.contentContainer, styles[viewMode])}>
            <Alert variant="info">The series has completed. Tracker stopped.</Alert>
          </Container>
        ) : null}

        {state ? (
          <>
            {isNeatQueueState(state) && (
              <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                <h2 className={styles.sectionTitle}>Series overview</h2>
                <div className={styles.seriesOverview}>
                  <section className={styles.seriesScores}>
                    {hasMatches ? (
                      <>
                        <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
                          {state.seriesScore}
                        </h3>
                        <ul className={styles.seriesScoresList}>
                          {state.matches.map((match) => {
                            // Determine winning team for overlay color
                            let winningTeamIndex: number | null = null;
                            if (match.rawMatchStats) {
                              const winningTeam = match.rawMatchStats.Teams.find((team) => team.Outcome === 2); // 2 = Win
                              if (winningTeam) {
                                winningTeamIndex = match.rawMatchStats.Teams.indexOf(winningTeam);
                              }
                            }

                            const teamColorId = winningTeamIndex === 0 ? team1Color : team2Color;
                            const teamColor =
                              winningTeamIndex !== null && winningTeamIndex < 2
                                ? getTeamColorOrDefault(teamColorId, winningTeamIndex)
                                : undefined;

                            return (
                              <li
                                key={match.matchId}
                                className={styles.seriesScore}
                                style={
                                  {
                                    "--series-score-bg": `url(${match.gameMapThumbnailUrl})`,
                                    "--team-color": teamColor?.hex ?? "transparent",
                                  } as React.CSSProperties
                                }
                              >
                                <a href={`#${match.matchId}`} className={styles.seriesScoreLink}>
                                  <img
                                    src={gameModeIconUrl(match.gameType).src}
                                    alt={match.gameType}
                                    className={styles.gameTypeIcon}
                                  />
                                  {match.gameScore}
                                  {match.gameSubScore != null ? (
                                    <span className={styles.seriesSubScore}>({match.gameSubScore})</span>
                                  ) : (
                                    ""
                                  )}
                                  <span className={styles.gameTypeAndMap}>{match.gameMap}</span>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : (
                      <div className={styles.noticeFlexFill}>
                        <Alert variant="info" icon="⏳">
                          Waiting for first match to complete...
                        </Alert>
                      </div>
                    )}
                  </section>
                  {state.teams.map((team, teamIndex) => {
                    const teamColorId = teamIndex === 0 ? team1Color : team2Color;
                    const teamColor = getTeamColorOrDefault(teamIndex < 2 ? teamColorId : undefined, teamIndex);

                    return (
                      <section
                        key={team.name}
                        className={styles.teamCard}
                        style={{ "--team-color": teamColor.hex } as React.CSSProperties}
                      >
                        <h3 className={styles.teamName}>{team.name}</h3>
                        <ul className={styles.playerList}>
                          {team.players.map((player) => {
                            const playerData = state.playersAssociationData?.[player.id];
                            return (
                              <li key={player.id}>
                                <PlayerName
                                  discordName={playerData?.discordName ?? player.displayName}
                                  gamertag={playerData?.gamertag ?? null}
                                  showIcons={true}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </Container>
            )}
            {isNeatQueueState(state) && seriesStats && (
              <Container mobileDown="0" className={classNames(styles.contentContainer, styles[viewMode])}>
                <SeriesStats
                  teamData={seriesStats.teamData}
                  playerData={seriesStats.playerData}
                  title="Series Totals"
                  metadata={seriesStats.metadata}
                  teamColors={teamColorsArray}
                />
              </Container>
            )}
            {isNeatQueueState(state) && hasMatches && (
              <>
                <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                  <h2 className={styles.sectionTitle}>Matches</h2>
                </Container>
                {((): React.ReactElement[] => {
                  const elements: React.ReactElement[] = [];
                  let substitutionIndex = 0;

                  for (const [matchIndex, match] of state.matches.entries()) {
                    // Add any substitutions that occurred before this match
                    while (substitutionIndex < sortedSubstitutionsList.length) {
                      const substitution = sortedSubstitutionsList[substitutionIndex];
                      if (new Date(match.endTime) < new Date(substitution.timestamp)) {
                        break;
                      }

                      elements.push(
                        <Container
                          key={`sub-${substitution.timestamp}`}
                          className={classNames(styles.contentContainer, styles[viewMode])}
                        >
                          <Alert variant="info" icon="↔️">
                            <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                            <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                          </Alert>
                        </Container>,
                      );
                      substitutionIndex++;
                    }

                    // Add match
                    const matchStats = allMatchStats.find((stats) => stats.matchId === match.matchId);

                    elements.push(
                      matchStats?.data ? (
                        <Container
                          key={match.matchId}
                          mobileDown="0"
                          className={classNames(styles.contentContainer, styles[viewMode])}
                        >
                          <MatchStatsView
                            data={matchStats.data}
                            id={match.matchId}
                            backgroundImageUrl={match.gameMapThumbnailUrl}
                            gameModeIconUrl={gameModeIconUrl(match.gameType).src}
                            gameModeAlt={match.gameType}
                            matchNumber={matchIndex + 1}
                            gameTypeAndMap={match.gameTypeAndMap}
                            duration={match.duration}
                            score={match.gameScore}
                            startTime={match.startTime}
                            endTime={match.endTime}
                            teamColors={teamColorsArray}
                          />
                        </Container>
                      ) : (
                        <Container
                          key={match.matchId}
                          className={classNames(styles.contentContainer, styles[viewMode])}
                        >
                          <Alert variant="warning">Match stats unavailable</Alert>
                        </Container>
                      ),
                    );
                  }

                  // Add any remaining substitutions that occurred after the last match
                  while (substitutionIndex < sortedSubstitutionsList.length) {
                    const substitution = sortedSubstitutionsList[substitutionIndex];
                    elements.push(
                      <Container
                        key={`sub-${substitution.timestamp}`}
                        className={classNames(styles.contentContainer, styles[viewMode])}
                      >
                        <Alert variant="info" icon="↔️">
                          <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                          <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                        </Alert>
                      </Container>,
                    );
                    substitutionIndex++;
                  }

                  return elements;
                })()}
              </>
            )}
            {isIndividualState(state) && hasMatches && individualGroupStats && (
              <>
                <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                  <h2 className={styles.sectionTitle}>Matches</h2>
                </Container>
                <IndividualModeMatches
                  groups={state.groups}
                  groupStats={individualGroupStats}
                  gameModeIconUrl={gameModeIconSrc}
                  teamColors={teamColorsArray}
                  viewMode={viewMode}
                  guildName={trackerInfo.title}
                  status={state.status}
                />
              </>
            )}
            {isIndividualState(state) && !hasMatches && (
              <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                <Alert variant="info" icon="⏳">
                  Tracking <strong>{state.gamertag}</strong>. Waiting for first match to complete...
                </Alert>
              </Container>
            )}
            {isNeatQueueState(state) && !hasMatches && state.playersAssociationData && (
              <PlayerPreSeriesInfo
                className={classNames(styles.contentContainer, styles[viewMode])}
                teams={state.teams}
                playersAssociationData={state.playersAssociationData}
                teamColors={teamColorsArray}
              />
            )}
            {isNeatQueueState(state) && !hasMatches && sortedSubstitutionsList.length > 0 && (
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
      </Container>
    </>
  );
}
