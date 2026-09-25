import type { ReactElement } from "react";
import { useState } from "react";
import { normalizeOutcomeString } from "@guilty-spark/shared/halo/match-enrichment";
import { IndividualTrackerViewer } from "../individual-tracker/viewer/individual-tracker-viewer";
import type { IndividualTrackerViewerRenderModel, ViewerMatchTab, ViewerTimelineItem } from "../individual-tracker/viewer/types";
import { StreamerOverlay } from "../streamer-overlay/streamer-overlay";
import { TeamDetailsContent } from "../streamer-overlay/team-details-content";
import { TopSection } from "../streamer-overlay/top-section";
import type { OverlayTab } from "../streamer-overlay/tabs-bar";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import { createFixtureCapabilityPreviewData } from "./capability-preview-data";
import type { CapabilityPreviewData } from "./capability-preview-data";
import styles from "./capability-preview.module.css";

type PreviewTab = "matchmaking" | "series" | "viewer";

export interface CapabilityPreviewProps {
  readonly gamertag: string;
  readonly sourceLabel: string;
  readonly isExample: boolean;
  readonly data?: CapabilityPreviewData | undefined;
  readonly previewMode: "player" | "observer";
}

const PREVIEW_TABS: readonly TabbedSectionTab<PreviewTab>[] = [
  { id: "matchmaking", label: "Matchmaking overlay", content: null },
  { id: "series", label: "Series overlay", content: null },
  { id: "viewer", label: "Viewer", content: null },
];

function buildMatchTab(match: CapabilityPreviewData["series"]["matches"][number], index: number): ViewerMatchTab {
  return {
    matchId: `${match.label}-${String(index)}`,
    mapName: match.map,
    mapBackgroundUrl: "",
    gameVariantCategory: 6,
    isMatchmaking: false,
    gameModeName: "Slayer",
    duration: "10 minutes",
    outcome: normalizeOutcomeString(match.result === "W" ? "Win" : match.result === "L" ? "Loss" : "Tie"),
    score: match.score,
    killsDeathsAssistsKda: "1.72",
    damageDealtTakenRatio: "1.20",
    colorHex: match.result === "W" ? "#8cffbe" : "#ff7382",
    startTime: "Today",
    endTime: "Today",
  };
}

function buildViewerRenderModel(data: CapabilityPreviewData): IndividualTrackerViewerRenderModel {
  const matches = data.viewer.matches.map(buildMatchTab);
  return {
    trackerId: "preview",
    gamertag: data.gamertag,
    status: "active",
    isLive: true,
    hasActiveSeries: true,
    activeSeriesContext: {
      title: `Series ${data.viewer.seriesScore}`,
      subtitle: "Preview series",
      teams: [],
    },
    lastUpdateTime: new Date().toISOString(),
    timeline: [
      {
        type: "series",
        series: {
          id: "preview-series",
          title: `Series ${data.viewer.seriesScore}`,
          subtitle: "Preview series",
          isActive: true,
          teams: [],
          matchBackgroundUrls: [],
          score: data.viewer.seriesScore,
          duration: "30 minutes",
          killsDeathsAssistsKda: "1.72",
          damageDealtTakenRatio: "1.20",
          startTime: "Today",
          endTime: "Today",
          matches,
          iconMatches: matches,
          colorHex: "#5fe7e0",
        },
      },
    ],
    accumulated: { total: matches.length, wins: matches.filter((match) => match.outcome === "Win").length, losses: matches.filter((match) => match.outcome === "Loss").length, ties: 0 },
    statsHighlights: [],
    preSeriesPlayerInfo: undefined,
    teamColors: [getTeamColorOrDefault("salmon", 0), getTeamColorOrDefault("cerulean", 1)],
  };
}

function RealStreamerOverlay({ data, previewMode, series }: { readonly data: CapabilityPreviewData; readonly previewMode: "player" | "observer"; readonly series: boolean }): ReactElement {
  const teamColors = [getTeamColorOrDefault("salmon", 0), getTeamColorOrDefault("cerulean", 1)];
  const tabs: readonly OverlayTab[] = data.series.matches.map((match, index) => ({
    type: "match",
    index,
    matchId: `${match.label}-${String(index)}`,
    label: match.label,
    score: match.score,
    teamColor: teamColors[index % 2]?.hex,
    icon: "",
  }));
  const topSection = (
    <TopSection
      title={series ? `Series ${data.series.score}` : "Matchmaking"}
      subtitle={series ? "NeatQueue // live series" : `Ranked Arena // ${data.matchmaking.map}`}
      iconUrl={null}
      showScore={true}
      showTeamDetails={false}
      seriesScore={series ? data.series.score.replace(" - ", ":") : data.matchmaking.score.replace(" - ", ":")}
      teamColors={teamColors}
      teamLeft={<TeamDetailsContent team={{ players: [{ id: data.gamertag, displayName: data.gamertag }] }} teamName="Eagle" disableTeamPlayerNames={false} renderPlayerNameContent={(_id, name): ReactElement => <>{name}</>} />}
      teamRight={<TeamDetailsContent team={{ players: [{ id: "preview-opponent", displayName: "RavenSix" }] }} teamName="Cobra" disableTeamPlayerNames={false} renderPlayerNameContent={(_id, name): ReactElement => <>{name}</>} />}
    />
  );

  return (
    <div className={styles.gameplayFrame} style={{ backgroundImage: `url(${previewMode === "player" ? "/in-game-player.jpg" : "/in-game-observer.jpg"})` }}>
      <StreamerOverlay
        topSection={topSection}
        teamColors={teamColors}
        tabs={tabs}
        showTabs={true}
        showTicker={true}
        showPreview={true}
        previewMode={previewMode}
        fontSizeStyles={{}}
        settingsUi={null}
        currentMatchGroup={{ matchIndex: 0, label: data.gamertag, rows: [] }}
        activeTabIndex={0}
        selectedTab={0}
        isPanelOpen={false}
        panelContent={null}
        onTabClick={(): void => undefined}
        onScrollComplete={(): void => undefined}
        onClosePanel={(): void => undefined}
      />
    </div>
  );
}

function RealViewer({ data }: { readonly data: CapabilityPreviewData }): ReactElement {
  const [expandedEntryKeys, setExpandedEntryKeys] = useState<ReadonlySet<string>>(new Set());

  const handleToggleEntry = (item: ViewerTimelineItem): void => {
    const key = item.type === "match" ? `match:${item.match.matchId}` : `series:${item.series.id}`;
    const next = new Set(expandedEntryKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedEntryKeys(next);
  };

  return (
    <div className={styles.gameplayFrame} style={{ backgroundImage: "url(/in-game-observer.jpg)" }}>
      <IndividualTrackerViewer
        renderModel={buildViewerRenderModel(data)}
        connectionStatus="connected"
        expandedEntryKeys={expandedEntryKeys}
        entryStates={new Map()}
        canManage={false}
        refreshPending={false}
        onToggleEntry={handleToggleEntry}
        onBackToManage={(): void => undefined}
        onRefresh={(): void => undefined}
      />
    </div>
  );
}

export function CapabilityPreview({ gamertag, sourceLabel, isExample, data: suppliedData, previewMode }: CapabilityPreviewProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PreviewTab>("matchmaking");
  const data = suppliedData ?? createFixtureCapabilityPreviewData(gamertag);

  return (
    <section className={styles.previewRegion} aria-label="Guilty Spark capability preview">
      <div className={styles.previewToolbar}>
        <TabbedSection
          tabs={PREVIEW_TABS}
          variant="navigation"
          selectedTabId={activeTab}
          tabListAriaLabel="Preview capability"
          onTabChange={setActiveTab}
          tabsClassName={styles.previewTabs}
        />
        <div className={styles.sourceLabel}>
          <span className={styles.liveDot} aria-hidden="true" />
          {isExample ? "Example preview" : "Preview"} · {sourceLabel || gamertag}
        </div>
      </div>
      <div className={styles.previewFrame}>
        {activeTab === "matchmaking" ? <RealStreamerOverlay data={data} previewMode={previewMode} series={false} /> : null}
        {activeTab === "series" ? <RealStreamerOverlay data={data} previewMode={previewMode} series={true} /> : null}
        {activeTab === "viewer" ? <RealViewer data={data} /> : null}
      </div>
      <p className={styles.previewHint}>Live overlay components · preview data</p>
    </section>
  );
}
