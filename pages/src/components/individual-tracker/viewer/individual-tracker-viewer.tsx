import React from "react";
import classNames from "classnames";
import { formatDistanceToNow, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { Alert } from "../../alert/alert";
import { Container } from "../../container/container";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { gameModeIconSrc } from "./game-mode-icon";
import type {
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerViewModel,
  ViewerMatchTab,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "./types";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly model: IndividualTrackerViewerViewModel;
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
      return "Connecting…";
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
      return "Reconnecting…";
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
  const base = `${wins.toString()}–${losses.toString()}`;
  return ties > 0 ? `${base}–${ties.toString()}` : base;
}

function accentStyle(colorHex: string | undefined): React.CSSProperties | undefined {
  return colorHex == null ? undefined : { borderLeftColor: colorHex };
}

function relativeTime(iso: string): string {
  const date = parseISO(iso);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : "unknown";
}

function MatchTab({ match }: { readonly match: ViewerMatchTab }): React.ReactElement {
  return (
    <div
      className={classNames(styles.tab, { [styles.tabAccented]: match.colorHex != null })}
      style={accentStyle(match.colorHex)}
      title={`${match.mapName} ${match.score}`}
    >
      <img className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
      <span className={styles.tabScore}>{match.score}</span>
    </div>
  );
}

function SeriesTab({ series }: { readonly series: ViewerSeriesTab }): React.ReactElement {
  return (
    <div className={classNames(styles.tab, styles.tabSeries)} title={`${series.title} ${series.score}`}>
      <span className={styles.tabSeriesTitle}>{series.title}</span>
      <span className={styles.tabScore}>{series.score}</span>
      <div className={styles.tabIcons}>
        {series.matches.map((match) => (
          <img key={match.matchId} className={styles.tabIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
        ))}
      </div>
    </div>
  );
}

function TabsBar({ timeline }: { readonly timeline: readonly ViewerTimelineItem[] }): React.ReactElement {
  return (
    <div className={styles.tabBar}>
      {timeline.map((item) => {
        switch (item.type) {
          case "match": {
            return <MatchTab key={item.match.matchId} match={item.match} />;
          }
          case "series": {
            return <SeriesTab key={item.series.id} series={item.series} />;
          }
          default: {
            throw new UnreachableError(item);
          }
        }
      })}
    </div>
  );
}

function MatchCard({ match }: { readonly match: ViewerMatchTab }): React.ReactElement {
  return (
    <div
      className={classNames(styles.matchCard, { [styles.matchCardAccented]: match.colorHex != null })}
      style={accentStyle(match.colorHex)}
      data-testid="match-card"
    >
      <img className={styles.matchIcon} src={gameModeIconSrc(match.gameVariantCategory)} alt="" />
      <div className={styles.matchBody}>
        <span className={styles.matchMap}>{match.mapName}</span>
        <span className={styles.matchMeta}>{relativeTime(match.startTime)}</span>
      </div>
      <span className={styles.matchScore}>{match.score}</span>
    </div>
  );
}

function SeriesCard({ series }: { readonly series: ViewerSeriesTab }): React.ReactElement {
  return (
    <div className={styles.seriesCard} data-testid="series-card">
      <div className={styles.seriesHeader}>
        <div className={styles.seriesTitleRow}>
          <span className={styles.seriesTitle}>{series.title}</span>
          <span className={styles.seriesSubtitle}>{series.subtitle}</span>
        </div>
        <span className={styles.seriesScore}>{series.score}</span>
      </div>
      <div className={styles.seriesMatches}>
        {series.matches.map((match) => (
          <MatchCard key={match.matchId} match={match} />
        ))}
      </div>
    </div>
  );
}

function Timeline({ timeline }: { readonly timeline: readonly ViewerTimelineItem[] }): React.ReactElement {
  if (timeline.length === 0) {
    return <Alert variant="info">No matches tracked yet.</Alert>;
  }

  return (
    <div className={styles.timeline}>
      {timeline.map((item) => {
        switch (item.type) {
          case "match": {
            return <MatchCard key={item.match.matchId} match={item.match} />;
          }
          case "series": {
            return <SeriesCard key={item.series.id} series={item.series} />;
          }
          default: {
            throw new UnreachableError(item);
          }
        }
      })}
    </div>
  );
}

export function IndividualTrackerViewer({ model }: IndividualTrackerViewerProps): React.ReactElement {
  const { renderModel } = model;

  if (renderModel == null) {
    return (
      <Container>
        <Alert variant="info">Waiting for tracker state…</Alert>
      </Container>
    );
  }

  const notice = connectionNotice(model.connectionStatus);

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

      <section className={styles.timelineSection}>
        <Timeline timeline={renderModel.timeline} />
      </section>
    </Container>
  );
}
