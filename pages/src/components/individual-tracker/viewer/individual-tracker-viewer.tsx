import React from "react";
import classNames from "classnames";
import { addMinutes, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
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
import type { IndividualTrackerViewerRenderModel, ViewerEntryState, ViewerTimelineItem } from "./types";
import styles from "./individual-tracker-viewer.module.css";

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

function automaticRefreshText(renderModel: IndividualTrackerViewerRenderModel): string {
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

  const nextAutomaticRefreshDate = addMinutes(lastUpdatedDate, 3);
  return formatDistanceToNow(nextAutomaticRefreshDate, { addSuffix: true });
}

function connectionNotice(connectionStatus: TrackerViewConnectionStatus): string | null {
  switch (connectionStatus) {
    case "connected": {
      return null;
    }
    case "connecting": {
      return "Connecting...";
    }
    case "disconnected": {
      return "Reconnecting...";
    }
    case "error": {
      return "Connection error. Retrying...";
    }
    case "not_found": {
      return "Tracker not found.";
    }
    case "stopped": {
      return "Tracker stopped.";
    }
    default: {
      throw new UnreachableError(connectionStatus);
    }
  }
}

function toOutcomeLabel(outcome: NormalizedMatchOutcome): OutcomeBadgeValue {
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

function summarizeSeriesOutcome(outcomes: readonly NormalizedMatchOutcome[]): OutcomeBadgeValue {
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

  const notice = connectionNotice(connectionStatus);
  const lastUpdateText = relativeTime(renderModel.lastUpdateTime);
  const refreshHint = `Last update: ${lastUpdateText} | Next update: ${automaticRefreshText(renderModel)}`;

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
                disabled={refreshPending || renderModel.status !== "active"}
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

        {notice != null && (
          <p className={styles.connectionNotice} data-testid="connection-notice">
            {notice}
          </p>
        )}

        {renderModel.topBarStats != null && renderModel.topBarStats.length > 0 && (
          <section className={styles.accumulatedSection}>
            <h2 className={styles.sectionTitle}>Accumulated Stats</h2>
            <ul className={styles.statsList}>
              {renderModel.topBarStats.map((stat) => (
                <li key={`${stat.label}-${stat.value}`} className={styles.statsItem}>
                  <span className={styles.statsLabel}>{stat.label}</span>
                  <span className={styles.statsValue}>{stat.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>
      <section className={styles.matchesSection}>
        <Container>
          <h2 className={styles.sectionTitle}>Tracked Gameplay</h2>
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
                          { label: "Start time", value: formatDate(match.startTime) },
                          { label: "End time", value: formatDate(match.endTime) },
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
                        { label: "Start time", value: formatDate(series.startTime) },
                        { label: "End time", value: formatDate(series.endTime) },
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
                              outcome={summarizeSeriesOutcome(series.matches.map((seriesMatch) => seriesMatch.outcome))}
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
                  </div>

                  {isExpanded && (
                    <div className={styles.entryBody}>
                      {state == null || (state.kind === "series" && state.state.status === "loading") ? (
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
