import { useState } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";
import type { ViewMode } from "../view-mode/view-mode-selector";
import type { ObserverViewColorSettings, SeriesStreamerSettings } from "../live-tracker/settings/types";
import { ArchiveSettingsDialog } from "./settings/archive-settings-dialog";
import { ArchiveSettingsTrigger } from "./settings/archive-settings-trigger";
import styles from "./discord-series-stats.module.css";

interface DiscordSeriesStatsViewProps extends DiscordSeriesStatsViewModel {
  readonly viewMode: ViewMode;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly observerColors: ObserverViewColorSettings;
  readonly colorLabels: { readonly first: string; readonly second: string } | null;
  readonly defaultTitle: string | null;
  readonly defaultSubtitle: string | null;
  readonly onSeriesSettingsChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly onObserverColorsChange: (updates: Partial<ObserverViewColorSettings>) => void;
  readonly onViewModeSelect: (mode: ViewMode) => void;
  readonly onAnalyticsTabSelected?: ((module: AnalyticsModule, matchId?: string) => void) | undefined;
}

function emojifySeriesScore(seriesScore: string): string {
  const teamScores = seriesScore.split(":").map((score) => score.trim());
  if (teamScores.length !== 2) {
    return seriesScore;
  }

  return `🦅${teamScores[0]}:${teamScores[1]}🐍`;
}

function getQueueTitle(title: string): string {
  const queueMatch = /^Queue #(\d+)/.exec(title);
  return queueMatch?.[1] != null ? `Queue #${queueMatch[1]}` : title;
}

export function DiscordSeriesStatsView({
  title,
  subtitle,
  viewMode,
  seriesSettings,
  observerColors,
  colorLabels,
  defaultTitle,
  defaultSubtitle,
  onSeriesSettingsChange,
  onObserverColorsChange,
  onViewModeSelect,
  onAnalyticsTabSelected,
  ...stats
}: DiscordSeriesStatsViewProps): ReactElement {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const documentTitle = `${getQueueTitle(title)} (${emojifySeriesScore(stats.seriesScore)}) | ${subtitle} Stats - Guilty Spark`;

  return (
    <>
      <title>{documentTitle}</title>
      <Container wide className={styles.pageHeader}>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <Heading tagName="h1" styleAs="h3">
              {title}
            </Heading>
            <div className={styles.headerSubtitle}>{subtitle}</div>
          </div>
          <ArchiveSettingsTrigger
            onClick={(): void => {
              setIsSettingsOpen(true);
            }}
          />
        </div>
      </Container>
      {isSettingsOpen && (
        <ArchiveSettingsDialog
          viewMode={viewMode}
          seriesSettings={seriesSettings}
          observerColors={observerColors}
          colorLabels={colorLabels}
          defaultTitle={defaultTitle}
          defaultSubtitle={defaultSubtitle}
          onClose={(): void => {
            setIsSettingsOpen(false);
          }}
          onSeriesSettingsChange={onSeriesSettingsChange}
          onObserverColorsChange={onObserverColorsChange}
          onViewModeSelect={onViewModeSelect}
        />
      )}
      <div className={styles.content}>
        <SharedSeriesStatsView
          title={title}
          subtitle={subtitle}
          showSeriesTitle={true}
          wide={viewMode === "wide"}
          useStableTeamCardKeys={stableTeamSlotsAvailable}
          onAnalyticsTabSelected={onAnalyticsTabSelected}
          {...stats}
        />
      </div>
    </>
  );
}
