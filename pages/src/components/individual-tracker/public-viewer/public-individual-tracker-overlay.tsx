import React from "react";
import classNames from "classnames";
import type { IndividualTopBarStatOption } from "../../streamer-settings/shared-types";
import type { PublicViewerSnapshot } from "./types";
import styles from "./public-individual-tracker-overlay.module.css";

interface PublicIndividualTrackerOverlayProps {
  readonly snapshot: PublicViewerSnapshot;
}

interface OverlayPlayer {
  readonly id: string;
  readonly displayName: string;
}

function getOverlayPlayerLabel(snapshot: PublicViewerSnapshot, player: OverlayPlayer): string {
  const discordName = snapshot.xuidToDiscordName[player.id] ?? "";
  const xboxName = player.displayName;

  if (snapshot.overlayShowDiscordNames && snapshot.overlayShowXboxNames) {
    if (discordName === "" || discordName === xboxName) {
      return xboxName;
    }

    return `${discordName} (${xboxName})`;
  }

  if (snapshot.overlayShowDiscordNames) {
    if (discordName !== "") {
      return discordName;
    }
  }

  if (snapshot.overlayShowXboxNames) {
    return xboxName;
  }

  return discordName === "" ? xboxName : discordName;
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
      {snapshot.overlayShowSubtitle ? <p className={styles.seriesSubtitle}>{activeSeries.subtitle}</p> : null}
      {snapshot.overlayShowTeamDetails ? (
        <div className={styles.teamGrid}>
          {activeSeries.teams.map((team, index) => (
            <section key={`series-team-${index.toString()}`} className={styles.teamCard}>
              <h3 className={styles.teamName}>{team.name}</h3>
              <p className={styles.teamPlayers}>
                {team.players.map((player) => getOverlayPlayerLabel(snapshot, player)).join(" • ")}
              </p>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderSeriesOverlayTop(snapshot: PublicViewerSnapshot): React.ReactNode {
  const activeSeries = snapshot.renderModel?.activeNeatQueueSeries;

  if (activeSeries == null || !snapshot.overlayShowTeamDetails || activeSeries.teams.length < 2) {
    return (
      <div className={styles.topFallback}>
        <h1 className={styles.topFallbackTitle}>
          {snapshot.overlayShowTitle && (activeSeries?.title ?? snapshot.trackerState?.gamertag ?? "Guilty Spark")}
        </h1>
      </div>
    );
  }

  const [leftTeam, rightTeam] = activeSeries.teams;

  return (
    <div className={styles.topSection}>
      <div className={styles.teamLeft}>
        <span className={styles.teamName}>{leftTeam.name}</span>
        <span className={styles.teamPlayers}>
          {leftTeam.players.map((player) => getOverlayPlayerLabel(snapshot, player)).join(" • ")}
        </span>
      </div>

      {snapshot.overlayShowScore && <div className={styles.topSeriesScore}>{activeSeries.seriesScore}</div>}

      <div className={styles.teamRight}>
        <span className={styles.teamName}>{rightTeam.name}</span>
        <span className={styles.teamPlayers}>
          {rightTeam.players.map((player) => getOverlayPlayerLabel(snapshot, player)).join(" • ")}
        </span>
      </div>
    </div>
  );
}

interface TrackedPlayerStatValue {
  readonly value: number;
  readonly display: string;
}

function getTrackedPlayerStatsMap(snapshot: PublicViewerSnapshot): Map<string, TrackedPlayerStatValue> {
  const playerData = snapshot.renderModel?.trackedPlayerTotals?.playerData;
  if (playerData === undefined) {
    return new Map();
  }

  for (const team of playerData) {
    if (team.players.length === 0) {
      continue;
    }
    const [player] = team.players;

    const statsMap = new Map<string, TrackedPlayerStatValue>();
    for (const stat of player.values) {
      statsMap.set(stat.name, {
        value: stat.value,
        display: stat.display,
      });
    }
    return statsMap;
  }

  return new Map();
}

function getSeriesWonLoss(snapshot: PublicViewerSnapshot): { won: number; lost: number } {
  const timeline = snapshot.renderModel?.gameplayTimeline ?? [];
  let won = 0;
  let lost = 0;

  for (const item of timeline) {
    if (item.type !== "group") {
      continue;
    }

    let matchWins = 0;
    let matchLosses = 0;
    for (const match of item.matches) {
      if (/^Win\s*-/.test(match.score)) {
        matchWins += 1;
      }
      if (/^Loss\s*-/.test(match.score)) {
        matchLosses += 1;
      }
    }

    if (matchWins > matchLosses) {
      won += 1;
    }
    if (matchLosses > matchWins) {
      lost += 1;
    }
  }

  return { won, lost };
}

function formatRankLine(label: string | null, csrLabel: string | null): string | null {
  const safeLabel = label ?? "";
  const safeCsrLabel = csrLabel ?? "";

  if (safeLabel === "" && safeCsrLabel === "") {
    return null;
  }

  if (safeLabel !== "" && safeCsrLabel !== "") {
    return `${safeLabel} (${safeCsrLabel})`;
  }

  return safeLabel !== "" ? safeLabel : safeCsrLabel;
}

function formatTopBarStatValue(snapshot: PublicViewerSnapshot, option: IndividualTopBarStatOption): string | null {
  const accStats = snapshot.overlayAccumulatedStats;
  const trackedStats = getTrackedPlayerStatsMap(snapshot);
  const { trackerSummary } = snapshot;

  if (accStats == null) {
    return null;
  }

  switch (option) {
    case "games-win-loss": {
      return `${accStats.wins.toString()}W:${accStats.losses.toString()}L`;
    }
    case "series-win-loss": {
      const series = getSeriesWonLoss(snapshot);
      return `${series.won.toString()}SW:${series.lost.toString()}SL`;
    }
    case "total-games": {
      return `${accStats.total.toString()} Total`;
    }
    case "matchmaking-games": {
      return `${accStats.matchmaking.toString()} Matchmaking`;
    }
    case "custom-local-games": {
      return `${accStats.custom.toString()} Custom/Local`;
    }
    case "current-rank": {
      return formatRankLine(trackerSummary?.rankLabel ?? null, trackerSummary?.csrLabel ?? null) ?? "Current Rank: N/A";
    }
    case "season-peak": {
      return (
        formatRankLine(trackerSummary?.seasonPeakRankTier ?? null, trackerSummary?.seasonPeakCsrLabel ?? null) ??
        "Season Peak: N/A"
      );
    }
    case "all-time-peak": {
      return (
        formatRankLine(trackerSummary?.allTimePeakRankLabel ?? null, trackerSummary?.allTimePeakCsrLabel ?? null) ??
        "All Time Peak: N/A"
      );
    }
    case "esra": {
      return "ESRA: N/A";
    }
    case "kills": {
      return trackedStats.get("Kills")?.display ?? null;
    }
    case "deaths": {
      return trackedStats.get("Deaths")?.display ?? null;
    }
    case "assists": {
      return trackedStats.get("Assists")?.display ?? null;
    }
    case "kda": {
      return trackedStats.get("KDA")?.display ?? null;
    }
    case "headshot-kills": {
      return trackedStats.get("Headshot kills")?.display ?? null;
    }
    case "shots-hit": {
      return trackedStats.get("Shots hit")?.display ?? null;
    }
    case "shots-fired": {
      return trackedStats.get("Shots fired")?.display ?? null;
    }
    case "accuracy": {
      return trackedStats.get("Accuracy")?.display ?? null;
    }
    case "damage-dealt": {
      return trackedStats.get("Damage dealt")?.display ?? null;
    }
    case "damage-taken": {
      return trackedStats.get("Damage taken")?.display ?? null;
    }
    case "damage-ratio": {
      return trackedStats.get("Damage ratio")?.display ?? null;
    }
    case "avg-life-time": {
      return trackedStats.get("Avg life time")?.display ?? null;
    }
    case "avg-damage-per-life": {
      return trackedStats.get("Avg damage per life")?.display ?? null;
    }
    case "kills-deaths-kd": {
      const kills = trackedStats.get("Kills");
      const deaths = trackedStats.get("Deaths");
      if (kills == null || deaths == null) {
        return null;
      }

      const kdRatio = deaths.value === 0 ? kills.value : kills.value / deaths.value;
      const kd = Number.isFinite(kdRatio) ? kdRatio.toFixed(2) : "0.00";

      return `${kills.display}:${deaths.display} (${kd})`;
    }
    case "kills-deaths-assists-kda": {
      const kills = trackedStats.get("Kills");
      const deaths = trackedStats.get("Deaths");
      const assists = trackedStats.get("Assists");
      const kda = trackedStats.get("KDA");
      if (kills == null || deaths == null || assists == null || kda == null) {
        return null;
      }

      return `${kills.display}:${deaths.display}:${assists.display} (${kda.display})`;
    }
    case "shots-hit-fired-accuracy": {
      const shotsHit = trackedStats.get("Shots hit");
      const shotsFired = trackedStats.get("Shots fired");
      const accuracy = trackedStats.get("Accuracy");
      if (shotsHit == null || shotsFired == null || accuracy == null) {
        return null;
      }

      return `${shotsHit.display}:${shotsFired.display} (${accuracy.display})`;
    }
    case "damage-dealt-taken-ratio": {
      const dealt = trackedStats.get("Damage dealt");
      const taken = trackedStats.get("Damage taken");
      const ratio = trackedStats.get("Damage ratio");
      if (dealt == null || taken == null || ratio == null) {
        return null;
      }

      return `${dealt.display}:${taken.display} (${ratio.display})`;
    }
    case "avg-life-damage-per-life": {
      const life = trackedStats.get("Avg life time");
      const damagePerLife = trackedStats.get("Avg damage per life");
      if (life == null || damagePerLife == null) {
        return null;
      }

      return `${life.display} (${damagePerLife.display})`;
    }
    default: {
      return null;
    }
  }
}

function renderNonSeriesTopBar(snapshot: PublicViewerSnapshot): React.ReactNode {
  const accStats = snapshot.overlayAccumulatedStats;
  if (accStats == null) {
    return (
      <div className={styles.topFallback}>
        <h1 className={styles.topFallbackTitle}>
          {snapshot.trackerState?.gamertag != null && snapshot.trackerState.gamertag !== ""
            ? snapshot.trackerState.gamertag
            : "Guilty Spark"}
        </h1>
      </div>
    );
  }

  const topBarStatItems = snapshot.overlayTopBarStatSlots
    .map((slot) => ({ slot, value: formatTopBarStatValue(snapshot, slot) }))
    .filter((entry): entry is { slot: IndividualTopBarStatOption; value: string } => entry.value != null);

  return (
    <div className={styles.topBarStats}>
      {snapshot.overlayShowTitle ? (
        <h1 className={styles.gamertagTitle}>
          {snapshot.trackerState?.gamertag != null && snapshot.trackerState.gamertag !== ""
            ? snapshot.trackerState.gamertag
            : "Guilty Spark"}
        </h1>
      ) : null}
      {topBarStatItems.length > 0 ? (
        <div className={styles.statsLine}>
          {topBarStatItems.map((item, index) => (
            <span key={`${item.slot}-${index.toString()}`} className={styles.statItem}>
              {item.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderTimelinePanel(snapshot: PublicViewerSnapshot, timelineIndex: number): React.ReactNode {
  const timeline = snapshot.renderModel?.gameplayTimeline ?? [];
  const item = timeline[timelineIndex];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      {snapshot.overlayShowSubtitle ? <p className={styles.seriesSubtitle}>{item.match.gameTypeAndMap}</p> : null}
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
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const isInSeries = snapshot.renderModel?.activeNeatQueueSeries != null;

  React.useEffect(() => {
    if (snapshot.overlayTabs.length === 0) {
      setActiveTabId(null);
      return;
    }

    const hasCurrent = activeTabId != null && snapshot.overlayTabs.some((tab) => tab.id === activeTabId);
    if (!hasCurrent) {
      setActiveTabId(snapshot.overlayTabs[0].id);
    }
  }, [snapshot.overlayTabs, activeTabId]);

  const activeTab = snapshot.overlayTabs.find((tab) => tab.id === activeTabId) ?? null;

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

  const cssVariables: React.CSSProperties = {
    "--overlay-team-color": activeTab?.teamColor ?? `var(--team-color-${snapshot.viewerTeamColor}, var(--halo-green))`,
    "--overlay-enemy-color": `var(--team-color-${snapshot.viewerEnemyColor}, var(--halo-red))`,
    "--font-size-queue-info": snapshot.overlayFontSizes.queueInfo,
    "--font-size-score": snapshot.overlayFontSizes.score,
    "--font-size-teams": snapshot.overlayFontSizes.teams,
    "--font-size-tabs": snapshot.overlayFontSizes.tabs,
    "--font-size-ticker": snapshot.overlayFontSizes.ticker,
  } as React.CSSProperties;

  return (
    <section className={styles.overlayRoot}>
      <div className={styles.overlayCard} style={cssVariables}>
        <header className={styles.headerMeta}>
          {snapshot.overlayShowTitle ? <h1 className={styles.title}>{title}</h1> : null}
          <span className={styles.status}>{getOverlayStatusText(snapshot)}</span>
        </header>

        {isInSeries ? renderSeriesOverlayTop(snapshot) : renderNonSeriesTopBar(snapshot)}

        {snapshot.overlayTabs.length > 0 ? (
          <section className={styles.detailsPanel}>
            {activeTab == null
              ? null
              : activeTab.type === "active-series"
                ? renderSeriesPanel(snapshot)
                : renderTimelinePanel(snapshot, activeTab.timelineIndex ?? 0)}
          </section>
        ) : null}

        <div className={styles.bottomSection}>
          {snapshot.overlayShowTabs ? (
            <nav className={styles.tabBar} aria-label="Overlay panels">
              {snapshot.overlayTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={classNames(styles.tabButton, {
                    [styles.tabButtonActive]: tab.id === activeTab?.id,
                  })}
                  style={tab.teamColor != null && !isInSeries ? { color: tab.teamColor } : undefined}
                  onClick={(): void => {
                    setActiveTabId(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : null}

          {snapshot.overlayShowTicker ? <p className={styles.ticker}>{getOverlayMessage(snapshot)}</p> : null}
        </div>
      </div>
    </section>
  );
}
