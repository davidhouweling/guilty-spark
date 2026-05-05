import React from "react";
import classNames from "classnames";
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

  const connectionState = snapshot.trackerState?.status ?? snapshot.connectionStatus;
  return `${connectionState} • ${snapshot.overlayColorMode} mode`;
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

interface OverlayTab {
  readonly id: string;
  readonly label: string;
  readonly type: "series" | "timeline";
  readonly timelineIndex?: number;
}

function buildTabs(snapshot: PublicViewerSnapshot): readonly OverlayTab[] {
  const timeline = snapshot.renderModel?.gameplayTimeline ?? [];
  const tabs: OverlayTab[] = [];

  if (snapshot.renderModel?.activeNeatQueueSeries != null) {
    tabs.push({ id: "series", label: "Series", type: "series" });
  }

  for (const [timelineIndex, item] of timeline.entries()) {
    tabs.push({
      id: `timeline-${timelineIndex.toString()}`,
      label: item.type === "group" ? `Set ${(timelineIndex + 1).toString()}` : `Game ${(timelineIndex + 1).toString()}`,
      type: "timeline",
      timelineIndex,
    });
  }

  return tabs;
}

function renderSeriesPanel(snapshot: PublicViewerSnapshot): React.ReactNode {
  const activeSeries = snapshot.renderModel?.activeNeatQueueSeries;
  if (activeSeries == null) {
    return <p className={styles.emptyPanel}>No active series is currently available.</p>;
  }

  return (
    <div className={styles.panelBody}>
      <div className={styles.seriesHeader}>
        <h2 className={styles.seriesTitle}>{activeSeries.title}</h2>
        <span className={styles.seriesScore}>{activeSeries.seriesScore}</span>
      </div>
      <p className={styles.seriesSubtitle}>{activeSeries.subtitle}</p>
      {snapshot.overlayShowTeamDetails ? (
        <div className={styles.teamGrid}>
          {activeSeries.teams.map((team, index) => (
            <section key={`series-team-${index.toString()}`} className={styles.teamCard}>
              <h3 className={styles.teamName}>{team.name}</h3>
              <p className={styles.teamPlayers}>{team.players.map((player) => player.displayName).join(" • ")}</p>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderTimelinePanel(snapshot: PublicViewerSnapshot, timelineIndex: number): React.ReactNode {
  const timeline = snapshot.renderModel?.gameplayTimeline ?? [];
  const item = timeline[timelineIndex];

  if (item == null) {
    return <p className={styles.emptyPanel}>Waiting for tracked gameplay timeline...</p>;
  }

  if (item.type === "group") {
    return (
      <div className={styles.panelBody}>
        <div className={styles.seriesHeader}>
          <h2 className={styles.seriesTitle}>{item.title}</h2>
          <span className={styles.seriesScore}>{item.seriesScore}</span>
        </div>
        <p className={styles.seriesSubtitle}>{item.subtitle}</p>
        <p className={styles.summaryLine}>{`${item.matches.length.toString()} tracked games in this set.`}</p>
      </div>
    );
  }

  return (
    <div className={styles.panelBody}>
      <h2 className={styles.seriesTitle}>{item.match.gameMode}</h2>
      <p className={styles.seriesSubtitle}>{item.match.gameTypeAndMap}</p>
      {snapshot.overlayShowTeamDetails ? (
        <div className={styles.matchMetaGrid}>
          <div className={styles.metaCell}>
            <span className={styles.metaLabel}>Score</span>
            <span className={styles.metaValue}>{item.match.score}</span>
          </div>
          <div className={styles.metaCell}>
            <span className={styles.metaLabel}>Duration</span>
            <span className={styles.metaValue}>{item.match.duration}</span>
          </div>
          <div className={styles.metaCell}>
            <span className={styles.metaLabel}>Start</span>
            <span className={styles.metaValue}>{item.match.startTime}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PublicIndividualTrackerOverlay({ snapshot }: PublicIndividualTrackerOverlayProps): React.ReactElement {
  const tabs = React.useMemo(() => buildTabs(snapshot), [snapshot]);
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null);
      return;
    }

    const hasCurrent = activeTabId != null && tabs.some((tab) => tab.id === activeTabId);
    if (!hasCurrent) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const title =
    snapshot.trackerState?.gamertag != null && snapshot.trackerState.gamertag !== ""
      ? `${snapshot.trackerState.gamertag} Overlay`
      : "Guilty Spark Overlay";

  const isInactive = snapshot.availability === "offline" || snapshot.availability === "not-found";

  if (isInactive) {
    return (
      <section className={styles.overlayRoot}>
        <div className={styles.minimalMark} aria-label="Guilty Spark overlay mark">
          Guilty Spark
        </div>
      </section>
    );
  }

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
        {snapshot.overlayShowTicker ? <p className={styles.message}>{getOverlayMessage(snapshot)}</p> : null}

        {tabs.length > 0 ? (
          <>
            {snapshot.overlayShowTabs ? (
              <nav className={styles.tabBar} aria-label="Overlay panels">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={classNames(styles.tabButton, {
                      [styles.tabButtonActive]: tab.id === activeTab?.id,
                    })}
                    onClick={(): void => {
                      setActiveTabId(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            ) : null}

            <section className={styles.detailsPanel}>
              {activeTab == null
                ? null
                : activeTab.type === "series"
                  ? renderSeriesPanel(snapshot)
                  : renderTimelinePanel(snapshot, activeTab.timelineIndex ?? 0)}
            </section>
          </>
        ) : (
          <section className={styles.detailsPanel}>
            <p className={styles.emptyPanel}>Waiting for tracked gameplay timeline...</p>
          </section>
        )}
      </div>
    </section>
  );
}
