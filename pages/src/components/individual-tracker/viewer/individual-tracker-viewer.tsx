import React from "react";
import classNames from "classnames";
import { addMinutes, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Container } from "../../container/container";
import { LoadingState } from "../../loading-state/loading-state";
import { OutcomeBadge, type OutcomeBadgeValue } from "../../outcome-badge/outcome-badge";
import { MatchStats } from "../../stats/match-stats";
import { StatsHeader } from "../../stats/stats-header";
import { SeriesStatsView } from "../../series-stats/series-stats";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { gameModeIconSrc } from "../game-mode-icon";
import { relativeTime } from "../timeline/timeline";
import type {
  IndividualTrackerViewerRenderModel,
  ViewerEntryState,
  ViewerTabOutcome,
  ViewerTimelineItem,
} from "./types";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly expandedEntryKeys: ReadonlySet<string>;
  readonly entryStates: ReadonlyMap<string, ViewerEntryState>;
  readonly canManage: boolean;
  readonly refreshInProgress: boolean;
  readonly refreshStartedAt: string | null;
  readonly refreshPending: boolean;
  readonly refreshMessage: string | null;
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

function isNearBottom(): boolean {
  const threshold = 200;
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold;
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

function connectionNotice(status: TrackerViewConnectionStatus): string | null {
  switch (status) {
    case "connecting": {
      return "Connecting...";
    }
    case "connected": {
      return null;
    }
    case "stopped": {
      return "Tracker stopped.";
    }
    case "error": {
      return "Connection error.";
    }
    case "disconnected": {
      return "Reconnecting...";
    }
    case "not_found": {
      return "Tracker not found.";
    }
    default: {
      throw new UnreachableError(status);
    }
  }
}

function recordText(renderModel: IndividualTrackerViewerRenderModel): string {
  const { wins, losses, ties } = renderModel.accumulated;
  const base = `${wins.toString()}:${losses.toString()}`;
  return ties > 0 ? `${base}:${ties.toString()}` : base;
}

function parseDate(value: string | null): Date | null {
  if (value == null) {
    return null;
  }

  const date = parseISO(value);
  return isValid(date) ? date : null;
}

function automaticRefreshText(renderModel: IndividualTrackerViewerRenderModel): string {
  if (renderModel.status === "paused") {
    return "Automatic refresh paused.";
  }

  if (renderModel.status === "stopped") {
    return "Automatic refresh stopped.";
  }

  const lastUpdatedDate = parseDate(renderModel.lastUpdateTime);
  if (lastUpdatedDate == null) {
    return "Automatic refresh schedule unavailable.";
  }

  const nextAutomaticRefreshDate = addMinutes(lastUpdatedDate, 3);
  return `Next automatic refresh ${formatDistanceToNow(nextAutomaticRefreshDate, { addSuffix: true })}`;
}

function toOutcomeLabel(outcome: ViewerTabOutcome): OutcomeBadgeValue {
  switch (outcome) {
    case "win": {
      return "Win";
    }
    case "loss": {
      return "Loss";
    }
    case "tie": {
      return "Tie";
    }
    case "dnf": {
      return "DNF";
    }
    case "unknown": {
      return "Unknown";
    }
    default: {
      throw new UnreachableError(outcome);
    }
  }
}

function summarizeSeriesOutcome(outcomes: readonly ViewerTabOutcome[]): OutcomeBadgeValue {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let dnf = 0;

  for (const outcome of outcomes) {
    switch (outcome) {
      case "win": {
        wins += 1;
        break;
      }
      case "loss": {
        losses += 1;
        break;
      }
      case "tie": {
        ties += 1;
        break;
      }
      case "dnf": {
        dnf += 1;
        break;
      }
      case "unknown": {
        break;
      }
      default: {
        throw new UnreachableError(outcome);
      }
    }
  }

  if (wins > losses) {
    return "Win";
  }
  if (losses > wins) {
    return "Loss";
  }
  if (wins === 0 && losses === 0 && dnf > 0) {
    return "DNF";
  }
  if (ties > 0) {
    return "Tie";
  }
  return "Unknown";
}

function matchHeaderBackgroundStyle(state: ViewerEntryState | undefined): React.CSSProperties {
  if (state?.kind === "match" && state.state.status === "loaded") {
    return {
      "--match-bg": `url(${state.state.gameMapThumbnailUrl})`,
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
  refreshInProgress,
  refreshStartedAt,
  refreshPending,
  refreshMessage,
  onToggleEntry,
  onBackToManage,
  onRefresh,
}: IndividualTrackerViewerProps): React.ReactElement {
  const latestEntryRef = React.useRef<HTMLDivElement | null>(null);
  const lastTimelineLengthRef = React.useRef<number>(renderModel.timeline.length);
  const nearBottomRef = React.useRef<boolean>(true);
  const [isNearBottomNow, setIsNearBottomNow] = React.useState(true);
  const [unseenEntries, setUnseenEntries] = React.useState(0);

  const oldestFirstTimeline = React.useMemo(() => [...renderModel.timeline].reverse(), [renderModel.timeline]);

  const scrollToLatest = React.useCallback((): void => {
    latestEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  React.useEffect(() => {
    function onScrollOrResize(): void {
      const nearBottom = isNearBottom();
      nearBottomRef.current = nearBottom;
      setIsNearBottomNow(nearBottom);
      if (nearBottom) {
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
    const nextLength = oldestFirstTimeline.length;
    if (nextLength > previousLength) {
      const delta = nextLength - previousLength;
      if (nearBottomRef.current) {
        scrollToLatest();
      } else {
        setUnseenEntries((current) => current + delta);
      }
    }
    lastTimelineLengthRef.current = nextLength;
  }, [oldestFirstTimeline.length, scrollToLatest]);

  const notice = connectionNotice(connectionStatus);
  const refreshStartedDate = parseDate(refreshStartedAt);
  const refreshHint = refreshInProgress
    ? refreshStartedDate != null
      ? `Refresh started ${formatDistanceToNow(refreshStartedDate, { addSuffix: true })}`
      : "Refreshing now."
    : automaticRefreshText(renderModel);

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
                onClick={onRefresh}
                disabled={refreshPending || refreshInProgress || renderModel.status !== "active"}
              >
                Refresh
              </Button>
            </div>
          </div>
        </Container>
      )}

      <Container>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.gamertag}>{renderModel.gamertag} Tracker</h1>
            <div className={styles.badges}>
              <span
                className={classNames(styles.statusBadge, {
                  [styles.statusActive]: renderModel.status === "active",
                  [styles.statusPaused]: renderModel.status === "paused",
                  [styles.statusStopped]: renderModel.status === "stopped",
                })}
              >
                {statusLabel(renderModel.status)}
              </span>
              {renderModel.isLive && <span className={styles.liveBadge}>Live</span>}
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.record} data-testid="record">
              {recordText(renderModel)}
            </span>
            <span className={styles.lastUpdated}>Last updated {relativeTime(renderModel.lastUpdateTime)}</span>
          </div>
        </header>

        {notice != null && (
          <p className={styles.connectionNotice} data-testid="connection-notice">
            {notice}
          </p>
        )}

        {refreshMessage != null && canManage && <Alert variant="info">{refreshMessage}</Alert>}

        <section className={styles.accumulatedSection}>
          <h2 className={styles.sectionTitle}>Accumulated Stats</h2>
          {renderModel.topBarStats != null && renderModel.topBarStats.length > 0 && (
            <ul className={styles.statsList}>
              {renderModel.topBarStats.map((stat) => (
                <li key={`${stat.label}-${stat.value}`} className={styles.statsItem}>
                  <span className={styles.statsLabel}>{stat.label}</span>
                  <span className={styles.statsValue}>{stat.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.matchesSection}>
          <h2 className={styles.sectionTitle}>Tracked Gameplay</h2>
          {oldestFirstTimeline.length === 0 ? (
            <Alert variant="info">No matches tracked yet.</Alert>
          ) : (
            <div className={styles.entriesList}>
              {oldestFirstTimeline.map((item, index) => {
                const key = entryKey(item);
                const isExpanded = expandedEntryKeys.has(key);
                const state = entryStates.get(key);
                const isLatest = index === oldestFirstTimeline.length - 1;

                if (item.type === "match") {
                  const { match } = item;
                  const entryRef = isLatest
                    ? (element: HTMLDivElement | null): void => {
                        latestEntryRef.current = element;
                      }
                    : undefined;

                  return (
                    <div key={key} className={styles.entry} ref={entryRef}>
                      <button
                        type="button"
                        className={styles.entryHeaderButton}
                        onClick={(): void => {
                          onToggleEntry(item);
                        }}
                        aria-expanded={isExpanded}
                        aria-label={`Match ${match.mapName}`}
                      >
                        <StatsHeader
                          title={match.mapName}
                          metadata={[
                            { label: "Score", value: match.score },
                            { label: "Start time", value: new Date(match.startTime).toLocaleString() },
                          ]}
                          backgroundStyle={matchHeaderBackgroundStyle(state)}
                          rightContent={
                            <div className={styles.entryHeaderRight}>
                              <div className={styles.entryHeaderVisuals}>
                                <img
                                  src={gameModeIconSrc(match.gameVariantCategory)}
                                  alt="Game mode"
                                  className={styles.entryModeIcon}
                                />
                                <OutcomeBadge outcome={toOutcomeLabel(match.outcome)} />
                              </div>
                              <span
                                className={classNames(styles.entryChevron, {
                                  [styles.entryChevronExpanded]: isExpanded,
                                })}
                                aria-hidden="true"
                              />
                            </div>
                          }
                        />
                      </button>

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
                const [firstMatch] = series.matches;
                const lastMatch = series.matches[series.matches.length - 1] ?? firstMatch;
                const entryRef = isLatest
                  ? (element: HTMLDivElement | null): void => {
                      latestEntryRef.current = element;
                    }
                  : undefined;

                return (
                  <div key={key} className={styles.entry} ref={entryRef}>
                    <button
                      type="button"
                      className={styles.entryHeaderButton}
                      onClick={(): void => {
                        onToggleEntry(item);
                      }}
                      aria-expanded={isExpanded}
                      aria-label={`Series ${series.title}`}
                    >
                      <StatsHeader
                        title={series.title}
                        subtitle={series.subtitle}
                        metadata={[
                          { label: "Score", value: series.score },
                          { label: "Matches", value: `${series.matches.length.toString()} matches` },
                          {
                            label: "Window",
                            value: `${new Date(firstMatch.startTime).toLocaleString()} - ${new Date(lastMatch.endTime).toLocaleString()}`,
                          },
                        ]}
                        backgroundStyle={
                          { "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)" } as React.CSSProperties
                        }
                        rightContent={
                          <div className={styles.entryHeaderRight}>
                            <div className={styles.entryHeaderVisuals}>
                              <div className={styles.seriesModeIcons}>
                                {series.matches.map((seriesMatch, iconIndex) => (
                                  <img
                                    key={`${seriesMatch.matchId}:${iconIndex.toString()}`}
                                    src={gameModeIconSrc(seriesMatch.gameVariantCategory)}
                                    alt="Game mode"
                                    className={classNames(styles.entryModeIcon, {
                                      [styles.seriesModeIconMuted]: seriesMatch.outcome === "loss",
                                    })}
                                  />
                                ))}
                              </div>
                              <OutcomeBadge
                                outcome={summarizeSeriesOutcome(
                                  series.matches.map((seriesMatch) => seriesMatch.outcome),
                                )}
                              />
                            </div>
                            <span
                              className={classNames(styles.entryChevron, {
                                [styles.entryChevronExpanded]: isExpanded,
                              })}
                              aria-hidden="true"
                            />
                          </div>
                        }
                      />
                    </button>

                    {isExpanded && (
                      <div className={styles.entryBody}>
                        {state == null || (state.kind === "series" && state.state.status === "loading") ? (
                          <LoadingState text="Loading series stats..." />
                        ) : state.kind === "series" && state.state.status === "error" ? (
                          <Alert variant="error">{state.state.message}</Alert>
                        ) : state.kind === "series" && state.state.status === "loaded" ? (
                          <SeriesStatsView {...state.state.viewModel} />
                        ) : (
                          <Alert variant="error">Unexpected entry state.</Alert>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </Container>

      {(!isNearBottomNow || unseenEntries > 0) && (
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
