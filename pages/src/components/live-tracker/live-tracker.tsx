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
import { useTeamColors } from "../team-colors/use-team-colors";
import { TeamColorPicker } from "../team-colors/team-color-picker";
import {
  ViewModeSelector,
  type ViewMode,
  type PreviewMode,
  type StreamerOptions,
} from "../view-mode/view-mode-selector";
import { PlayerPreSeriesInfo } from "../player-pre-series-info/player-pre-series-info";
import { PlayerName } from "../player-name/player-name";
import { useStreamerPreferences } from "./use-streamer-preferences";
import { StreamerOverlay } from "./streamer-overlay";
import { IndividualModeMatches } from "./individual-mode-matches";
import {
  useTrackerInfo,
  useTrackerState,
  useTrackerIdentity,
  useTrackerParams,
  useAllMatchStats,
  useSeriesStats,
  useHasMatches,
  useSubstitutions,
} from "./live-tracker-context";
import styles from "./live-tracker.module.css";

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

function gameModeIconSrc(gameMode: string): string {
  return gameModeIconUrl(gameMode).src;
}

export function LiveTrackerView(): React.ReactElement {
  // Use selector hooks to get data from context
  const trackerInfo = useTrackerInfo();
  const state = useTrackerState();
  const identity = useTrackerIdentity();
  const params = useTrackerParams();
  const hasMatches = useHasMatches();
  const sortedSubstitutions = useSubstitutions();
  const allMatchStats = useAllMatchStats();
  const seriesStats = useSeriesStats();

  const isIndividualMode = params.type === "individual";
  const guildId = identity?.guildId ?? "";
  const queueNumber = identity?.queueNumber ?? 0;
  const teamColors = useTeamColors(guildId, queueNumber);
  const streamerPreferences = useStreamerPreferences();

  // Helper to parse streamer options, preview mode, and team colors from URL
  function parseUrlParams(): {
    viewMode: ViewMode;
    previewMode: PreviewMode;
    streamerOptions: StreamerOptions;
    teamColorPrefs: Record<number, string>;
  } {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const viewParam = urlSearchParams.get("view");
    const previewParam = urlSearchParams.get("preview");
    const viewMode =
      viewParam === "standard" || viewParam === "wide" || viewParam === "streamer"
        ? (viewParam as ViewMode)
        : "standard";
    const previewMode =
      previewParam === "none" || previewParam === "player" || previewParam === "observer"
        ? (previewParam as PreviewMode)
        : streamerPreferences.previewMode;
    const streamerOptions: StreamerOptions = {
      showTeams: urlSearchParams.get("showTeams") !== "false",
      showTicker: urlSearchParams.get("showTicker") !== "false",
      showTabs: urlSearchParams.get("showTabs") !== "false",
      showServerName: urlSearchParams.get("showServerName") !== "false",
    };
    // Team colors: teamColor0, teamColor1, etc.
    const teamColorPrefs: Record<number, string> = {};
    for (let i = 0; i < 2; i++) {
      const color = urlSearchParams.get(`teamColor${i.toString()}`);
      if (color != null) {
        teamColorPrefs[i] = color;
      }
    }
    return { viewMode, previewMode, streamerOptions, teamColorPrefs };
  }

  // State for view mode, preview mode, streamer options
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return parseUrlParams().viewMode;
    }
    return "standard";
  });
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() => {
    if (typeof window !== "undefined") {
      return parseUrlParams().previewMode;
    }
    return streamerPreferences.previewMode;
  });
  const [streamerOptions, setStreamerOptions] = useState<StreamerOptions>(() => {
    if (typeof window !== "undefined") {
      return parseUrlParams().streamerOptions;
    }
    return streamerPreferences.streamerOptions;
  });

  // Sync team colors from URL/localStorage on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const { teamColorPrefs } = parseUrlParams();
      Object.entries(teamColorPrefs).forEach(([idx, colorId]) => {
        teamColors.setTeamColor(Number(idx), colorId);
      });
    }
  }, [guildId, queueNumber]);

  // Helper to update URL with current state
  function updateUrl(
    currentViewMode: ViewMode,
    currentPreviewMode: PreviewMode,
    currentOptions: StreamerOptions,
    teamColorOverride?: { teamIndex: number; colorId: string },
  ): void {
    if (typeof window !== "undefined") {
      const urlSearchParams = new URLSearchParams(window.location.search);
      urlSearchParams.set("view", currentViewMode);
      urlSearchParams.set("preview", currentPreviewMode);
      urlSearchParams.set("showTeams", String(currentOptions.showTeams));
      urlSearchParams.set("showTicker", String(currentOptions.showTicker));
      urlSearchParams.set("showTabs", String(currentOptions.showTabs));
      urlSearchParams.set("showServerName", String(currentOptions.showServerName));
      // Team colors
      for (let i = 0; i < 2; i++) {
        const color =
          teamColorOverride?.teamIndex === i ? teamColorOverride.colorId : teamColors.getTeamColorForTeam(i).id;
        urlSearchParams.set(`teamColor${i.toString()}`, color);
      }
      const newUrl = `${window.location.pathname}?${urlSearchParams.toString()}`;
      window.history.replaceState({}, "", newUrl);
    }
  }

  const handleSetViewMode = useCallback(
    (mode: ViewMode): void => {
      setViewMode(mode);
      updateUrl(mode, previewMode, streamerOptions);
    },
    [previewMode, streamerOptions, teamColors],
  );

  const handleSetPreviewMode = useCallback(
    (mode: PreviewMode): void => {
      setPreviewMode(mode);
      streamerPreferences.setPreviewMode(mode);
      updateUrl(viewMode, mode, streamerOptions);
    },
    [viewMode, streamerOptions, streamerPreferences, teamColors],
  );

  const handleSetStreamerOptions = useCallback(
    (options: StreamerOptions): void => {
      setStreamerOptions(options);
      streamerPreferences.setStreamerOptions(options);
      updateUrl(viewMode, previewMode, options);
    },
    [viewMode, previewMode, streamerPreferences, teamColors],
  );

  const handleSetTeamColor = useCallback(
    (teamIndex: number, colorId: string): void => {
      teamColors.setTeamColor(teamIndex, colorId);
      updateUrl(viewMode, previewMode, streamerOptions, { teamIndex, colorId });
    },
    [viewMode, previewMode, streamerOptions, teamColors],
  );

  // Sort substitutions by timestamp for rendering between matches (memoized)
  const sortedSubstitutionsList = useMemo(() => {
    if (!sortedSubstitutions) {
      return [];
    }
    return [...sortedSubstitutions].sort((a, b) => compareAsc(a.timestamp, b.timestamp));
  }, [sortedSubstitutions]);

  // Memoize team colors array to prevent unnecessary re-renders
  const teamColorsArray = useMemo(() => {
    if (!state) {
      return [];
    }
    return state.teams.map((_, idx) => teamColors.getTeamColorForTeam(idx));
  }, [state, teamColors]);

  // For individual mode, compute match-to-group mapping and group stats
  const matchGroupingInfo = useMemo(() => {
    if (!isIndividualMode || !state) {
      return null;
    }

    const matchToGroup = new Map<string, string>();
    for (const [groupId, grouping] of Object.entries(state.matchGroupings)) {
      for (const matchId of grouping.matchIds) {
        matchToGroup.set(matchId, groupId);
      }
    }

    return { matchToGroup };
  }, [isIndividualMode, state]);

  // Compute stats for each match grouping in individual mode
  const groupingStats = useMemo(() => {
    if (!isIndividualMode || !state || !matchGroupingInfo) {
      return null;
    }

    const statsMap = new Map<
      string,
      { teamData: MatchStatsData[]; playerData: MatchStatsData[]; metadata: SeriesMetadata | null }
    >();

    for (const [groupId, grouping] of Object.entries(state.matchGroupings)) {
      const groupMatches = state.matches.filter((m) => grouping.matchIds.includes(m.matchId));
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

      // Compute scores string for metadata
      const scoresStr = groupMatches.map((m) => m.gameScore).join(", ");
      const metadata = calculateSeriesMetadata(groupMatches, scoresStr);

      const teamPresenter = new SeriesTeamStatsPresenter();
      const playerPresenter = new SeriesPlayerStatsPresenter();

      statsMap.set(groupId, {
        teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, state.medalMetadata),
        playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, state.medalMetadata),
        metadata,
      });
    }

    return statsMap;
  }, [isIndividualMode, state, matchGroupingInfo]);

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

  const title: string[] = [trackerInfo.guildNameText];
  if (isIndividualMode) {
    title.push("- Individual Tracker");
  } else if (state) {
    title.push(`#${state.queueNumber.toString()}`);
    title.push(`(${state.seriesScore})`);
  }
  title.push("| Live Tracker - Guilty Spark");

  // Render streamer overlay if in streamer mode
  if (viewMode === "streamer" && state) {
    return (
      <>
        <title>{title.join(" ")}</title>
        <StreamerOverlay
          teamColors={teamColorsArray}
          gameModeIconUrl={gameModeIconSrc}
          viewMode={viewMode}
          onViewModeSelect={handleSetViewMode}
          previewMode={previewMode}
          onPreviewModeSelect={handleSetPreviewMode}
          streamerOptions={streamerOptions}
          onStreamerOptionsChange={handleSetStreamerOptions}
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
            <h1 className={styles.headerTitle}>{trackerInfo.guildNameText}</h1>
            <div className={styles.headerSubtitle}>
              {isIndividualMode
                ? "Individual Tracker"
                : `Queue #${state ? state.queueNumber.toString() : trackerInfo.queueNumberText}`}
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
        <ViewModeSelector
          currentMode={viewMode}
          onModeSelect={handleSetViewMode}
          previewMode={previewMode}
          onPreviewModeSelect={handleSetPreviewMode}
          streamerOptions={streamerOptions}
          onStreamerOptionsChange={handleSetStreamerOptions}
        />
        {state?.status === "stopped" ? (
          <Container className={classNames(styles.contentContainer, styles[viewMode])}>
            <Alert variant="info">The series has completed. Tracker stopped.</Alert>
          </Container>
        ) : null}

        {state ? (
          <>
            {!isIndividualMode && (
              <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                <h2 className={styles.sectionTitle}>Series overview</h2>
                <div className={styles.seriesOverview}>
                  <section className={styles.seriesScores}>
                    {hasMatches ? (
                      <>
                        <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
                          {state.seriesScore.replaceAll(/(🦅|🐍)/g, "").trim()}
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

                            const teamColor =
                              winningTeamIndex !== null ? teamColors.getTeamColorForTeam(winningTeamIndex) : null;

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
                    const teamColor = teamColors.getTeamColorForTeam(teamIndex);

                    return (
                      <section
                        key={team.name}
                        className={styles.teamCard}
                        style={{ "--team-color": teamColor.hex } as React.CSSProperties}
                      >
                        <TeamColorPicker
                          currentColor={teamColor}
                          onColorSelect={(colorId): void => {
                            handleSetTeamColor(teamIndex, colorId);
                          }}
                          teamName={team.name}
                        />
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
            {!isIndividualMode && seriesStats && (
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
            {!isIndividualMode && hasMatches && (
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
            {isIndividualMode && hasMatches && matchGroupingInfo && groupingStats && (
              <>
                <Container className={classNames(styles.contentContainer, styles[viewMode])}>
                  <h2 className={styles.sectionTitle}>Matches</h2>
                </Container>
                <IndividualModeMatches
                  matches={state.matches}
                  matchGroupings={state.matchGroupings}
                  allMatchStats={allMatchStats}
                  groupingStats={groupingStats}
                  gameModeIconUrl={gameModeIconSrc}
                  teamColors={teamColorsArray}
                  viewMode={viewMode}
                  guildName={state.guildName}
                  seriesData={state.seriesData}
                  status={state.status}
                />
              </>
            )}
            {!isIndividualMode && !hasMatches && state.playersAssociationData ? (
              <PlayerPreSeriesInfo
                className={classNames(styles.contentContainer, styles[viewMode])}
                teams={state.teams}
                playersAssociationData={state.playersAssociationData}
                teamColors={teamColorsArray}
              />
            ) : null}
            {!isIndividualMode && !hasMatches && sortedSubstitutionsList.length > 0 && (
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
