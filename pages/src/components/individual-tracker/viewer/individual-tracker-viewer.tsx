import React from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { Container } from "../../container/container";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { relativeTime, Timeline } from "../timeline/timeline";
import type { IndividualTrackerViewerRenderModel } from "./types";
import { TabsBar } from "./viewer-tabs";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly connectionStatus: TrackerViewConnectionStatus;
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

export function IndividualTrackerViewer({
  renderModel,
  connectionStatus,
}: IndividualTrackerViewerProps): React.ReactElement {
  const notice = connectionNotice(connectionStatus);

  return (
    <Container>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.gamertag}>{renderModel.gamertag}</h1>
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

      <TabsBar timeline={renderModel.timeline} />

      <Timeline timeline={renderModel.timeline} />
    </Container>
  );
}
