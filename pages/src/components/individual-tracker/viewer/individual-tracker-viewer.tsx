import React from "react";
import classNames from "classnames";
import { addMinutes, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Container } from "../../container/container";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { relativeTime, Timeline } from "../timeline/timeline";
import type { IndividualTrackerViewerRenderModel, MatchStatsPanelState } from "./types";
import { TabsBar } from "./viewer-tabs";
import { StatsPanel } from "./stats-panel";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly selectedMatchId: string | null;
  readonly matchStatsPanelState: MatchStatsPanelState | null;
  readonly canManage: boolean;
  readonly refreshInProgress: boolean;
  readonly refreshStartedAt: string | null;
  readonly refreshPending: boolean;
  readonly refreshMessage: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
  readonly onBackToManage: () => void;
  readonly onRefresh: () => void;
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

export function IndividualTrackerViewer({
  renderModel,
  connectionStatus,
  selectedMatchId,
  matchStatsPanelState,
  canManage,
  refreshInProgress,
  refreshStartedAt,
  refreshPending,
  refreshMessage,
  onSelectMatch,
  onDeselect,
  onBackToManage,
  onRefresh,
}: IndividualTrackerViewerProps): React.ReactElement {
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
          <TabsBar
            timeline={renderModel.timeline}
            selectedMatchId={selectedMatchId}
            onSelectMatch={onSelectMatch}
            onDeselect={onDeselect}
          />

          <StatsPanel state={matchStatsPanelState} />

          <Timeline timeline={renderModel.timeline} />
        </section>
      </Container>
    </>
  );
}
