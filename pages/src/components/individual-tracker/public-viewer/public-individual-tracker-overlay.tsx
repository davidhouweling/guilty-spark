import React from "react";
import type { PublicViewerSnapshot } from "./types";
import styles from "./public-individual-tracker-overlay.module.css";

interface PublicIndividualTrackerOverlayProps {
  readonly snapshot: PublicViewerSnapshot;
}

function getOverlayStatusText(snapshot: PublicViewerSnapshot): string {
  if (snapshot.loading) {
    return "Loading";
  }

  if (snapshot.availability === "not-found") {
    return "Not found";
  }

  if (snapshot.availability === "offline") {
    return "Offline";
  }

  return snapshot.trackerState?.status ?? snapshot.connectionStatus;
}

function getOverlayMessage(snapshot: PublicViewerSnapshot): string {
  if (snapshot.loading) {
    return "Connecting to active tracker feed...";
  }

  if (snapshot.errorMessage != null) {
    return snapshot.errorMessage;
  }

  if (snapshot.availability === "not-found") {
    return "No active Xbox identity is linked for this XUID.";
  }

  if (snapshot.availability === "offline") {
    return "Tracker is currently offline.";
  }

  if (snapshot.renderModel?.activeNeatQueueSeries != null) {
    return `${snapshot.renderModel.activeNeatQueueSeries.title} • ${snapshot.renderModel.activeNeatQueueSeries.seriesScore}`;
  }

  return "Live tracker connected.";
}

export function PublicIndividualTrackerOverlay({ snapshot }: PublicIndividualTrackerOverlayProps): React.ReactElement {
  const title =
    snapshot.trackerState?.gamertag != null && snapshot.trackerState.gamertag !== ""
      ? `${snapshot.trackerState.gamertag} Overlay`
      : "Guilty Spark Overlay";

  return (
    <section className={styles.overlayRoot}>
      <div
        className={styles.overlayCard}
        style={
          {
            "--overlay-team-color": `var(--team-color-${snapshot.viewerTeamColor}, var(--halo-green))`,
            "--overlay-enemy-color": `var(--team-color-${snapshot.viewerEnemyColor}, var(--halo-red))`,
          } as React.CSSProperties
        }
      >
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <span className={styles.status}>{getOverlayStatusText(snapshot)}</span>
        </header>
        <p className={styles.message}>{getOverlayMessage(snapshot)}</p>
      </div>
    </section>
  );
}
