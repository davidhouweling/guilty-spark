import type { ReactElement } from "react";
import { useState } from "react";
import classNames from "classnames";
import type { CapabilityPreviewData, CapabilityPreviewMatch } from "./capability-preview-data";
import { createFixtureCapabilityPreviewData } from "./capability-preview-data";
import styles from "./capability-preview.module.css";

type PreviewTab = "matchmaking" | "series" | "viewer";
type OverlayPanel = "score" | "stats" | null;

export interface CapabilityPreviewProps {
  readonly gamertag: string;
  readonly sourceLabel: string;
  readonly isExample: boolean;
  readonly data?: CapabilityPreviewData | undefined;
}

const PREVIEW_TABS: readonly { readonly id: PreviewTab; readonly label: string }[] = [
  { id: "matchmaking", label: "Matchmaking overlay" },
  { id: "series", label: "Series overlay" },
  { id: "viewer", label: "Viewer" },
];

function PreviewTabs({ activeTab, onChange }: { readonly activeTab: PreviewTab; readonly onChange: (tab: PreviewTab) => void }): ReactElement {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="Preview capability">
      {PREVIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={classNames(styles.tab, activeTab === tab.id && styles.tabActive)}
          onClick={(): void => {
            onChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PreviewSourceLabel({ label, isExample }: { readonly label: string; readonly isExample: boolean }): ReactElement {
  return (
    <div className={styles.sourceLabel}>
      <span className={styles.liveDot} aria-hidden="true" />
      {isExample ? "Example preview" : "Preview"} · {label}
    </div>
  );
}

function OverlayHeader({ title, subtitle }: { readonly title: string; readonly subtitle: string }): ReactElement {
  return (
    <header className={styles.overlayHeader}>
      <div>
        <p className={styles.overlayEyebrow}>GUILTY SPARK // LIVE FEED</p>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span className={styles.modePill}>LIVE</span>
    </header>
  );
}

function MatchmakingPreview({ data, onPanelChange, openPanel }: { readonly data: CapabilityPreviewData; readonly onPanelChange: (panel: OverlayPanel) => void; readonly openPanel: OverlayPanel }): ReactElement {
  return (
    <div className={styles.canvas}>
      <div className={styles.gameBackdrop} aria-hidden="true" />
      <div className={styles.overlayContent}>
        <OverlayHeader
          title="MATCHMAKING"
          subtitle={`Ranked Arena // ${data.matchmaking.map} · ${data.matchmaking.score}`}
        />
        <div className={styles.matchScoreline}>
          <div className={styles.teamBlock}>
            <span className={styles.teamMark}>EAGLE</span>
            <strong>50</strong>
          </div>
          <span className={styles.scoreDivider}>:</span>
          <div className={classNames(styles.teamBlock, styles.teamBlockEnemy)}>
            <span className={styles.teamMark}>COBRA</span>
            <strong>41</strong>
          </div>
        </div>
        <div className={styles.overlayActions}>
          <button type="button" onClick={(): void => onPanelChange(openPanel === "score" ? null : "score")}>
            Scoreboard
          </button>
          <button type="button" onClick={(): void => onPanelChange(openPanel === "stats" ? null : "stats")}>
            Player stats
          </button>
        </div>
        {openPanel === "score" ? <TickerPanel rows={data.matchmaking.rows} /> : null}
        {openPanel === "stats" ? <StatsPanel /> : null}
        <div className={styles.bottomTicker}>
          <span>soundmanD</span>
          <span>1,248 score</span>
          <span>1.72 KDA</span>
          <span>03:42</span>
        </div>
      </div>
    </div>
  );
}

function SeriesPreview({ data, onPanelChange, openPanel }: { readonly data: CapabilityPreviewData; readonly onPanelChange: (panel: OverlayPanel) => void; readonly openPanel: OverlayPanel }): ReactElement {
  return (
    <div className={styles.canvas}>
      <div className={classNames(styles.gameBackdrop, styles.seriesBackdrop)} aria-hidden="true" />
      <div className={styles.overlayContent}>
        <OverlayHeader title={`SERIES ${data.series.score}`} subtitle="NeatQueue // Best of 5" />
        <div className={styles.seriesTrack}>
          {data.series.matches.map((match) => (
            <button key={match.label} type="button" className={styles.seriesMatch} onClick={(): void => onPanelChange("stats")}>
              <span>{match.label}</span>
              <strong>{match.result}</strong>
              <small>{match.map}</small>
              <em>{match.score}</em>
            </button>
          ))}
        </div>
        <div className={styles.overlayActions}>
          <button type="button" onClick={(): void => onPanelChange(openPanel === "score" ? null : "score")}>
            Series score
          </button>
          <button type="button" onClick={(): void => onPanelChange(openPanel === "stats" ? null : "stats")}>
            Series stats
          </button>
        </div>
        {openPanel === "score" ? <TickerPanel rows={data.matchmaking.rows} /> : null}
        {openPanel === "stats" ? <StatsPanel /> : null}
        <div className={styles.bottomTicker}>
          <span>soundmanD</span>
          <span>Series lead</span>
          <span>2 wins</span>
          <span>Next: Recharge</span>
        </div>
      </div>
    </div>
  );
}

function TickerPanel({ rows }: { readonly rows: readonly { readonly name: string; readonly score: string; readonly kda: string }[] }): ReactElement {
  return (
    <div className={styles.floatingPanel}>
      <div className={styles.panelTitle}>MATCH STATS</div>
      {rows.map((row) => (
        <div key={row.name} className={styles.panelRow}>
          <span>{row.name}</span>
          <strong>{row.score}</strong>
          <span>{row.kda} KDA</span>
        </div>
      ))}
    </div>
  );
}

function StatsPanel(): ReactElement {
  return (
    <div className={styles.floatingPanel}>
      <div className={styles.panelTitle}>PLAYER PROFILE</div>
      <div className={styles.statsGrid}>
        <span>Rank<strong>Diamond 5</strong></span>
        <span>Win rate<strong>68%</strong></span>
        <span>Accuracy<strong>54.2%</strong></span>
        <span>Avg. KDA<strong>1.72</strong></span>
      </div>
    </div>
  );
}

function ViewerPreview({ data }: { readonly data: CapabilityPreviewData }): ReactElement {
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  return (
    <div className={styles.viewerCanvas}>
      <header className={styles.viewerHeader}>
        <div>
          <p className={styles.overlayEyebrow}>PUBLIC VIEWER</p>
          <h3>{data.gamertag}</h3>
          <p>Recent matches and series history</p>
        </div>
        <span className={styles.viewerStatus}>TRACKING</span>
      </header>
      <div className={styles.viewerSummary}>
        <div><span>Series</span><strong>{data.viewer.seriesScore}</strong></div>
        <div><span>Matches</span><strong>{String(data.viewer.matches.length)}</strong></div>
        <div><span>Win rate</span><strong>68%</strong></div>
      </div>
      <div className={styles.viewerList}>
        {data.viewer.matches.map((match: CapabilityPreviewMatch) => {
          const isExpanded = expandedMatch === match.label;
          return (
            <button
              key={match.label}
              type="button"
              className={styles.viewerMatch}
              aria-expanded={isExpanded}
              onClick={(): void => {
                setExpandedMatch(isExpanded ? null : match.label);
              }}
            >
              <span className={styles.resultBadge}>{match.result}</span>
              <span><strong>{match.map}</strong><small>{match.label}</small></span>
              <span className={styles.viewerScore}>{match.score}</span>
              <span className={styles.chevron} aria-hidden="true">{isExpanded ? "-" : "+"}</span>
              {isExpanded ? <span className={styles.matchDetails}>KDA 1.72 · Accuracy 54.2% · 12 minutes</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CapabilityPreview({ gamertag, sourceLabel, isExample, data: suppliedData }: CapabilityPreviewProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PreviewTab>("matchmaking");
  const [openPanel, setOpenPanel] = useState<OverlayPanel>(null);
  const data = suppliedData ?? createFixtureCapabilityPreviewData(gamertag);

  const handleTabChange = (tab: PreviewTab): void => {
    setActiveTab(tab);
    setOpenPanel(null);
  };

  return (
    <section className={styles.previewRegion} aria-label="Guilty Spark capability preview">
      <div className={styles.previewToolbar}>
        <PreviewTabs activeTab={activeTab} onChange={handleTabChange} />
        <PreviewSourceLabel label={sourceLabel || gamertag} isExample={isExample} />
      </div>
      <div className={styles.previewFrame}>
        {activeTab === "matchmaking" ? (
          <MatchmakingPreview data={data} openPanel={openPanel} onPanelChange={setOpenPanel} />
        ) : null}
        {activeTab === "series" ? (
          <SeriesPreview data={data} openPanel={openPanel} onPanelChange={setOpenPanel} />
        ) : null}
        {activeTab === "viewer" ? <ViewerPreview data={data} /> : null}
      </div>
      <p className={styles.previewHint}>Interactive preview · select a tab or explore the controls inside</p>
    </section>
  );
}
