import React from "react";
import classNames from "classnames";
import ReactTimeAgo from "react-time-ago";
import { addMinutes, isValid, parseISO } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { summarizeSeriesOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Container } from "../../container/container";
import { LoadingState } from "../../loading-state/loading-state";
import { OutcomeBadge } from "../../outcome-badge/outcome-badge";
import { MatchStats } from "../../stats/match-stats";
import { StatsHeader } from "../../stats/stats-header";
import { SeriesStatsView } from "../../series-stats/series-stats";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { gameModeIconSrc } from "../game-mode-icon";
import { StatsHighlights } from "./stats-highlights";
import type { IndividualTrackerViewerRenderModel, ViewerEntryState, ViewerTimelineItem } from "./types";
import styles from "./individual-tracker-viewer.module.css";

const SERIES_BACKGROUND_ROTATION_MS = 10_000;
const SERIES_BACKGROUND_FADE_MS = 900;
const SERIES_BACKGROUND_GLITCH_MS = 260;

interface IndividualTrackerViewerProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly expandedEntryKeys: ReadonlySet<string>;
  readonly entryStates: ReadonlyMap<string, ViewerEntryState>;
  readonly canManage: boolean;
  readonly refreshPending: boolean;
  readonly onToggleEntry: (item: ViewerTimelineItem) => void;
  readonly onBackToManage: () => void;
  readonly onRefresh: () => void;
}

function entryKey(item: ViewerTimelineItem): string {
  if (item.type === "match") {
    return `match:${item.match.matchId}`;
  }
  return `series:${item.series.id}`;
}

function isNearLatest(): boolean {
  const threshold = 200;
  return window.scrollY <= threshold;
}

function statusLabel(status: TrackerStatus): string {
  switch (status) {
    case "active": {
      return "Active";
    }
    case "paused": {
      return "Paused";
    }
    case "stopped": {
      return "Stopped";
    }
    default: {
      throw new UnreachableError(status);
    }
  }
}

type ViewerStatusTone = "active" | "paused" | "stopped" | "syncing" | "degraded";

function getViewerStatusBadge(
  trackerStatus: TrackerStatus,
  connectionStatus: TrackerViewConnectionStatus,
): { label: string; tone: ViewerStatusTone } {
  if (trackerStatus !== "active") {
    switch (trackerStatus) {
      case "paused": {
        return { label: statusLabel(trackerStatus), tone: "paused" };
      }
      case "stopped": {
        return { label: statusLabel(trackerStatus), tone: "stopped" };
      }
      default: {
        throw new UnreachableError(trackerStatus);
      }
    }
  }

  switch (connectionStatus) {
    case "connected": {
      return { label: "Active", tone: "active" };
    }
    case "connecting": {
      return { label: "Connecting", tone: "syncing" };
    }
    case "disconnected": {
      return { label: "Reconnecting", tone: "syncing" };
    }
    case "error": {
      return { label: "Connection issue", tone: "degraded" };
    }
    case "not_found": {
      return { label: "Not found", tone: "degraded" };
    }
    case "stopped": {
      return { label: "Stopped", tone: "stopped" };
    }
    default: {
      throw new UnreachableError(connectionStatus);
    }
  }
}

function parseDate(value: string | null): Date | null {
  if (value == null) {
    return null;
  }

  const date = parseISO(value);
  return isValid(date) ? date : null;
}

function formatDate(value: string | null): string {
  const date = parseDate(value);
  return date == null ? "unknown" : date.toLocaleString();
}

function toSeriesPlayerLabel(discordName: string | null, gamertag: string | null): string {
  const normalizedDiscordName = discordName?.trim();
  if (normalizedDiscordName != null && normalizedDiscordName !== "") {
    return normalizedDiscordName;
  }

  const normalizedGamertag = gamertag?.trim();
  if (normalizedGamertag != null && normalizedGamertag !== "") {
    return normalizedGamertag;
  }

  return "Unknown player";
}

function handleEntryHeaderKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  item: ViewerTimelineItem,
  onToggleEntry: (item: ViewerTimelineItem) => void,
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onToggleEntry(item);
}

function lastUpdateContent(renderModel: IndividualTrackerViewerRenderModel): React.ReactNode {
  const lastUpdatedDate = parseDate(renderModel.lastUpdateTime);
  if (lastUpdatedDate == null) {
    return "unknown";
  }

  return <ReactTimeAgo date={lastUpdatedDate} locale="en" />;
}

function nextUpdateContent(renderModel: IndividualTrackerViewerRenderModel): React.ReactNode {
  if (renderModel.status === "paused") {
    return "paused";
  }

  if (renderModel.status === "stopped") {
    return "stopped";
  }

  const lastUpdatedDate = parseDate(renderModel.lastUpdateTime);
  if (lastUpdatedDate == null) {
    return "unavailable";
  }

  return <ReactTimeAgo date={addMinutes(lastUpdatedDate, 3)} locale="en" />;
}

function connectionAwareNextUpdate(
  renderModel: IndividualTrackerViewerRenderModel,
  statusBadge: { label: string; tone: ViewerStatusTone },
): React.ReactNode {
  if (statusBadge.tone === "syncing") {
    return "reconnecting";
  }

  if (statusBadge.tone === "degraded") {
    return "connection issue";
  }

  return nextUpdateContent(renderModel);
}

function getBackgroundAt(backgrounds: readonly string[], index: number): string {
  return Preconditions.checkExists(backgrounds[index], "Expected series background at index");
}

function matchHeaderBackgroundStyle(
  mapBackgroundUrl: string,
  state: ViewerEntryState | undefined,
): React.CSSProperties {
  if (mapBackgroundUrl !== "" && mapBackgroundUrl !== "data:,") {
    return {
      "--match-bg": `url(${mapBackgroundUrl})`,
    } as React.CSSProperties;
  }

  if (state?.kind === "match" && state.state.status === "loaded") {
    return {
      "--match-bg": `url(${state.state.gameMapThumbnailUrl})`,
    } as React.CSSProperties;
  }

  return {
    "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)",
  } as React.CSSProperties;
}

function seriesHeaderBackgroundStyle(
  matchBackgroundUrls: readonly string[],
  rotationTick: number,
  isTransitioning: boolean,
  isGlitching: boolean,
): React.CSSProperties {
  const backgrounds = matchBackgroundUrls.filter((url) => url !== "" && url !== "data:,");

  if (backgrounds.length > 0) {
    const currentIndex = rotationTick % backgrounds.length;
    const previousIndex = (currentIndex - 1 + backgrounds.length) % backgrounds.length;
    const currentBackground = getBackgroundAt(backgrounds, currentIndex);
    const previousBackground = getBackgroundAt(backgrounds, previousIndex);

    const baseBackground = isTransitioning && backgrounds.length > 1 ? previousBackground : currentBackground;
    const overlayBackground = currentBackground;

    return {
      "--match-bg": `url(${baseBackground})`,
      "--match-bg-next": `url(${overlayBackground})`,
      "--match-bg-next-opacity": isTransitioning ? 1 : 0,
      "--match-glitch-opacity": isGlitching && backgrounds.length > 1 ? 0.28 : 0,
    } as React.CSSProperties;
  }

  return {
    "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)",
  } as React.CSSProperties;
}

export function IndividualTrackerViewer({
  renderModel,
  connectionStatus,
  expandedEntryKeys,
  entryStates,
  canManage,
  refreshPending,
  onToggleEntry,
  onBackToManage,
  onRefresh,
}: IndividualTrackerViewerProps): React.ReactElement {
  const latestEntryRef = React.useRef<HTMLDivElement | null>(null);
  const lastTimelineLengthRef = React.useRef<number>(renderModel.timeline.length);
  const nearLatestRef = React.useRef<boolean>(true);
  const [isNearLatestNow, setIsNearLatestNow] = React.useState(true);
  const [unseenEntries, setUnseenEntries] = React.useState(0);
  const [seriesBackgroundTick, setSeriesBackgroundTick] = React.useState(0);
  const [isSeriesBackgroundTransitioning, setIsSeriesBackgroundTransitioning] = React.useState(false);
  const [isSeriesBackgroundGlitching, setIsSeriesBackgroundGlitching] = React.useState(false);
  const seriesFadeTimeoutRef = React.useRef<number | null>(null);
  const seriesGlitchTimeoutRef = React.useRef<number | null>(null);

  const { timeline } = renderModel;

  const scrollToLatest = React.useCallback((): void => {
    latestEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  React.useEffect(() => {
    function onScrollOrResize(): void {
      const nearLatest = isNearLatest();
      nearLatestRef.current = nearLatest;
      setIsNearLatestNow(nearLatest);
      if (nearLatest) {
        setUnseenEntries(0);
      }
    }

    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return (): void => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  React.useEffect(() => {
    const previousLength = lastTimelineLengthRef.current;
    const nextLength = timeline.length;
    if (nextLength > previousLength) {
      const delta = nextLength - previousLength;
      if (nearLatestRef.current) {
        scrollToLatest();
      } else {
        setUnseenEntries((current) => current + delta);
      }
    }
    lastTimelineLengthRef.current = nextLength;
  }, [timeline.length, scrollToLatest]);

  React.useEffect(() => {
    const beginTransition = (): void => {
      setSeriesBackgroundTick((current) => current + 1);
      setIsSeriesBackgroundTransitioning(true);
      setIsSeriesBackgroundGlitching(true);

      if (seriesFadeTimeoutRef.current != null) {
        window.clearTimeout(seriesFadeTimeoutRef.current);
      }

      if (seriesGlitchTimeoutRef.current != null) {
        window.clearTimeout(seriesGlitchTimeoutRef.current);
      }

      seriesFadeTimeoutRef.current = window.setTimeout(() => {
        setIsSeriesBackgroundTransitioning(false);
      }, SERIES_BACKGROUND_FADE_MS);

      seriesGlitchTimeoutRef.current = window.setTimeout(() => {
        setIsSeriesBackgroundGlitching(false);
      }, SERIES_BACKGROUND_GLITCH_MS);
    };

    const intervalId = window.setInterval(beginTransition, SERIES_BACKGROUND_ROTATION_MS);

    return (): void => {
      window.clearInterval(intervalId);

      if (seriesFadeTimeoutRef.current != null) {
        window.clearTimeout(seriesFadeTimeoutRef.current);
      }

      if (seriesGlitchTimeoutRef.current != null) {
        window.clearTimeout(seriesGlitchTimeoutRef.current);
      }
    };
  }, []);

  const statusBadge = getViewerStatusBadge(renderModel.status, connectionStatus);
  const canRefresh = statusBadge.tone === "active";
  const refreshHint = (
    <>
      Last update: {lastUpdateContent(renderModel)} | Next update: {connectionAwareNextUpdate(renderModel, statusBadge)}
    </>
  );

  return (
    <>
      {canManage && (
        <Container>
          <div className={styles.viewerActionBar}>
            <Button variant="secondary" size="small" className={styles.backButton} onClick={onBackToManage}>
              Back to manager
            </Button>

            <div className={styles.viewerActionRight}>
              <p className={styles.refreshHint}>{refreshHint}</p>
              <Button
                variant="secondary"
                size="small"
                loading={refreshPending}
                onClick={onRefresh}
                disabled={refreshPending || !canRefresh}
              >
                Refresh
              </Button>
            </div>
          </div>
        </Container>
      )}
      <Container>
        <div className={styles.header}>
          <h1 className={styles.title}>{renderModel.gamertag} Tracker</h1>
          <div className={styles.badges}>
            <span
              className={classNames(styles.statusBadge, {
                [styles.statusActive]: statusBadge.tone === "active",
                [styles.statusPaused]: statusBadge.tone === "paused",
                [styles.statusStopped]: statusBadge.tone === "stopped",
                [styles.statusSyncing]: statusBadge.tone === "syncing",
                [styles.statusDegraded]: statusBadge.tone === "degraded",
              })}
            >
              {statusBadge.label}
            </span>
            {renderModel.isLive && <span className={styles.liveBadge}>Live</span>}
          </div>
        </div>
      </Container>
      <section className={styles.matchesSection}>
        <Container>
          <h2 className={styles.sectionTitle}>Tracked Gameplay</h2>
        </Container>
        <Container mobileDown="0">
          <StatsHighlights items={renderModel.statsHighlights ?? []} />
        </Container>
        {timeline.length === 0 ? (
          <Container>
            <Alert variant="info">No matches tracked yet.</Alert>
          </Container>
        ) : (
          <Container mobileDown="0" className={styles.entriesList}>
            {timeline.map((item, index) => {
              const key = entryKey(item);
              const isExpanded = expandedEntryKeys.has(key);
              const state = entryStates.get(key);
              const isLatest = index === 0;

              if (item.type === "match") {
                const { match } = item;
                const entryRef = isLatest
                  ? (element: HTMLDivElement | null): void => {
                      latestEntryRef.current = element;
                    }
                  : undefined;

                return (
                  <div key={key} className={styles.entry} ref={entryRef}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={styles.entryHeaderButton}
                      onClick={(): void => {
                        onToggleEntry(item);
                      }}
                      onKeyDown={(event): void => {
                        handleEntryHeaderKeyDown(event, item, onToggleEntry);
                      }}
                      aria-expanded={isExpanded}
                      aria-label={`Match ${match.gameModeName} on ${match.mapName}`}
                    >
                      <StatsHeader
                        title={`${match.gameModeName}: ${match.mapName}`}
                        metadata={[
                          { label: "Score", value: match.score },
                          { label: "Duration", value: match.duration },
                          { label: "End time", value: formatDate(match.endTime) },
                          { label: "Kills:Deaths:Assists (KDA)", value: match.killsDeathsAssistsKda },
                          { label: "Damage D:T (D/T)", value: match.damageDealtTakenRatio },
                        ]}
                        backgroundStyle={matchHeaderBackgroundStyle(match.mapBackgroundUrl, state)}
                        rightContent={
                          <div className={styles.entryHeaderRight}>
                            <div className={styles.entryHeaderVisuals}>
                              <img
                                src={gameModeIconSrc(match.gameVariantCategory)}
                                alt={match.gameModeName}
                                className={styles.entryModeIcon}
                              />
                              <OutcomeBadge outcome={match.outcome} />
                            </div>
                            <span
                              className={classNames(styles.entryChevron, {
                                [styles.entryChevronExpanded]: isExpanded,
                              })}
                              aria-hidden="true"
                            >
                              <svg viewBox="0 0 12 12" focusable="false" className={styles.entryChevronIcon}>
                                <path d="M2.5 4.5 6 8l3.5-3.5" />
                              </svg>
                            </span>
                          </div>
                        }
                      />
                    </div>

                    {isExpanded && (
                      <div className={styles.entryBody}>
                        {state == null || (state.kind === "match" && state.state.status === "loading") ? (
                          <LoadingState text="Loading match stats..." />
                        ) : state.kind === "match" && state.state.status === "error" ? (
                          <Alert variant="error">{state.state.message}</Alert>
                        ) : state.kind === "match" && state.state.status === "loaded" ? (
                          <MatchStats
                            data={state.state.data}
                            id={`match-${state.state.matchId}`}
                            backgroundImageUrl=""
                            gameModeIconUrl={gameModeIconSrc(state.state.gameVariantCategory)}
                            gameModeAlt=""
                            matchNumber={index + 1}
                            gameTypeAndMap={match.mapName}
                            duration={state.state.duration}
                            score={match.score}
                            startTime={state.state.startTime}
                            endTime={state.state.endTime}
                            teamColors={renderModel.teamColors}
                            killMatrixPivotData={state.state.killMatrixPivotData}
                            transposedKillMatrixPivotData={state.state.transposedKillMatrixPivotData}
                            scoreProgressionViewData={state.state.scoreProgressionViewData}
                            showHeader={false}
                          />
                        ) : (
                          <Alert variant="error">Unexpected entry state.</Alert>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              const { series } = item;
              const entryRef = isLatest
                ? (element: HTMLDivElement | null): void => {
                    latestEntryRef.current = element;
                  }
                : undefined;

              return (
                <div key={key} className={styles.entry} ref={entryRef}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.entryHeaderButton}
                    onClick={(): void => {
                      onToggleEntry(item);
                    }}
                    onKeyDown={(event): void => {
                      handleEntryHeaderKeyDown(event, item, onToggleEntry);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`Series ${series.title}`}
                  >
                    <StatsHeader
                      title={series.title}
                      subtitle={series.subtitle}
                      metadata={[
                        { label: "Score", value: series.score },
                        {
                          label: "Matches",
                          value: `${series.matches.length.toString()} match${series.matches.length === 1 ? "" : "es"}`,
                        },
                        { label: "Duration", value: series.duration },
                        { label: "Kills:Deaths:Assists (KDA)", value: series.killsDeathsAssistsKda },
                        { label: "Damage D:T (D/T)", value: series.damageDealtTakenRatio },
                        series.isActive
                          ? { label: "Start time", value: formatDate(series.startTime) }
                          : { label: "End time", value: formatDate(series.endTime) },
                      ]}
                      backgroundStyle={seriesHeaderBackgroundStyle(
                        series.matchBackgroundUrls,
                        seriesBackgroundTick,
                        isSeriesBackgroundTransitioning,
                        isSeriesBackgroundGlitching,
                      )}
                      rightContent={
                        <div className={styles.entryHeaderRight}>
                          <div className={styles.entryHeaderVisuals}>
                            <div className={styles.seriesModeIcons}>
                              {series.matches.map((seriesMatch, iconIndex) => (
                                <img
                                  key={`${seriesMatch.matchId}:${iconIndex.toString()}`}
                                  src={gameModeIconSrc(seriesMatch.gameVariantCategory)}
                                  alt={seriesMatch.gameModeName}
                                  className={classNames(styles.entryModeIcon, {
                                    [styles.seriesModeIconMuted]: seriesMatch.outcome === "Loss",
                                  })}
                                />
                              ))}
                            </div>
                            <OutcomeBadge
                              outcome={
                                series.isActive
                                  ? "In progress"
                                  : summarizeSeriesOutcome(series.matches.map((seriesMatch) => seriesMatch.outcome))
                              }
                            />
                          </div>
                          <span
                            className={classNames(styles.entryChevron, {
                              [styles.entryChevronExpanded]: isExpanded,
                            })}
                            aria-hidden="true"
                          >
                            <svg viewBox="0 0 12 12" focusable="false" className={styles.entryChevronIcon}>
                              <path d="M2.5 4.5 6 8l3.5-3.5" />
                            </svg>
                          </span>
                        </div>
                      }
                    />
                  </div>

                  {isExpanded && (
                    <div className={classNames(styles.entryBody, styles.seriesEntryBody)}>
                      {series.matches.length === 0 ? (
                        <div className={styles.preSeriesPanel}>
                          <Alert variant="info">Series is active and waiting for the first tracked match.</Alert>
                          {series.teams.length > 0 && (
                            <div className={styles.preSeriesTeams} aria-label="Active series teams">
                              {series.teams.map((team) => (
                                <section key={team.id} className={styles.preSeriesTeam}>
                                  <h3 className={styles.preSeriesTeamName}>{team.name}</h3>
                                  <ul className={styles.preSeriesPlayerList}>
                                    {team.players.map((player, playerIndex) => (
                                      <li
                                        key={`${team.id.toString()}:${playerIndex.toString()}`}
                                        className={styles.preSeriesPlayer}
                                      >
                                        {toSeriesPlayerLabel(player.discordName, player.gamertag)}
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : state == null || (state.kind === "series" && state.state.status === "loading") ? (
                        <LoadingState text="Loading series stats..." />
                      ) : state.kind === "series" && state.state.status === "error" ? (
                        <Alert variant="error">{state.state.message}</Alert>
                      ) : state.kind === "series" && state.state.status === "loaded" ? (
                        <SeriesStatsView {...state.state.viewModel} noGutter={true} />
                      ) : (
                        <Alert variant="error">Unexpected entry state.</Alert>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Container>
        )}
      </section>

      {(!isNearLatestNow || unseenEntries > 0) && (
        <button
          type="button"
          className={styles.jumpToLatestButton}
          onClick={(): void => {
            scrollToLatest();
            setUnseenEntries(0);
          }}
        >
          {unseenEntries > 0 ? `Jump to latest (${unseenEntries.toString()} new)` : "Jump to latest"}
        </button>
      )}
    </>
  );
}
