import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { SeriesStatsView as SharedSeriesStatsView } from "../series-stats/series-stats";
import type { SeriesStatsViewModel as DiscordSeriesStatsViewModel } from "../series-stats/types";
import type { ViewMode } from "../view-mode/view-mode-selector";
import { ViewModeSelector } from "../view-mode/view-mode-selector";
import { SeriesTitleSection } from "../live-tracker/settings/series-title-section";
import { SeriesTeamNameInputs } from "../live-tracker/settings/series-team-name-inputs";
import { ObserverColorSettings } from "../live-tracker/settings/observer-color-settings";
import type { ObserverViewColorSettings, SeriesStreamerSettings } from "../live-tracker/settings/types";
import stylesTeamNames from "../live-tracker/settings/series-team-section.module.css";
import styles from "./discord-series-stats.module.css";

interface DiscordSeriesStatsViewProps extends DiscordSeriesStatsViewModel {
  readonly viewMode: ViewMode;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly observerColors: ObserverViewColorSettings;
  readonly stableTeamSlotsAvailable: boolean;
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
  stableTeamSlotsAvailable,
  defaultTitle,
  defaultSubtitle,
  onSeriesSettingsChange,
  onObserverColorsChange,
  onViewModeSelect,
  onAnalyticsTabSelected,
  ...stats
}: DiscordSeriesStatsViewProps): ReactElement {
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
          <ViewModeSelector
            currentMode={viewMode}
            availableModes={["standard", "wide"]}
            inline
            onModeSelect={onViewModeSelect}
            showCurrentModeLabel
          />
        </div>
        <details className={styles.titleSettings}>
          <summary>Series title settings</summary>
          <SeriesTitleSection
            settings={seriesSettings}
            defaultTitle={defaultTitle}
            defaultSubtitle={defaultSubtitle}
            onChange={onSeriesSettingsChange}
          />
        </details>
        <details className={styles.titleSettings}>
          <summary>Team name settings</summary>
          {stableTeamSlotsAvailable ? (
            <div className={stylesTeamNames.container}>
              <SeriesTeamNameInputs
                settings={seriesSettings}
                onChange={onSeriesSettingsChange}
                description="These names apply to overview cards; match Timeline labels are separate."
              />
            </div>
          ) : (
            <p>Team names cannot be customized because stable series teams are unavailable.</p>
          )}
        </details>
        <details className={styles.titleSettings}>
          <summary>Team color settings</summary>
          {stableTeamSlotsAvailable ? (
            <>
              <p>Archived series use observer colors in stable series-team order.</p>
              <ObserverColorSettings
                settings={observerColors}
                firstLabel="First series team color"
                secondLabel="Second series team color"
                onChange={onObserverColorsChange}
              />
            </>
          ) : (
            <p>Team colors cannot be customized because stable series teams are unavailable.</p>
          )}
        </details>
      </Container>
      <div className={styles.content}>
        <SharedSeriesStatsView
          {...stats}
          title={title}
          subtitle={subtitle}
          showSeriesTitle={true}
          wide={viewMode === "wide"}
          onAnalyticsTabSelected={onAnalyticsTabSelected}
        />
      </div>
    </>
  );
}
