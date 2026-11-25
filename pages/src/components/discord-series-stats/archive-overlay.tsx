import { useMemo } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Button } from "../button/button";
import { createStreamerOverlaySection } from "../streamer-overlay/create";
import { TopSection } from "../streamer-overlay/top-section";
import { TeamDetailsContent } from "../streamer-overlay/team-details-content";
import { SeriesStatsView } from "../series-stats/series-stats";
import type { ArchiveOverlayTeamModel, ArchiveSeriesOverlayViewModel } from "./archive-series-overlay-presenter";
import styles from "./archive-overlay.module.css";

interface ArchiveOverlayProps {
  readonly model: ArchiveSeriesOverlayViewModel;
  readonly onAnalyticsTabSelected: (module: AnalyticsModule, matchId?: string) => void;
  readonly onExitPreview: () => void;
}

function renderTeamDetails(team: ArchiveOverlayTeamModel | null): ReactElement | null {
  return team == null ? null : (
    <TeamDetailsContent
      team={{ players: team.players }}
      teamName={team.name}
      disableTeamPlayerNames={team.disableTeamPlayerNames}
      renderPlayerNameContent={(_playerId, displayName): ReactElement => <>{displayName}</>}
    />
  );
}

export function ArchiveSeriesOverlay({
  model,
  onAnalyticsTabSelected,
  onExitPreview,
}: ArchiveOverlayProps): ReactElement {
  const StreamerOverlaySection = useMemo(() => createStreamerOverlaySection(), []);
  const topSection = (
    <TopSection
      title={model.title}
      subtitle={model.subtitle}
      iconUrl={model.iconUrl}
      showScore={model.showScore}
      showTeamDetails={model.showTeamDetails}
      seriesScore={model.seriesScore}
      teamColors={[...model.teamColors]}
      teamLeft={renderTeamDetails(model.teamLeft)}
      teamRight={renderTeamDetails(model.teamRight)}
    />
  );
  const hasPanelContent = useMemo(() => (): boolean => true, []);
  const renderPanelContent = (tabIndex: number): ReactElement => {
    const panel = model.panelsByTabIndex.get(tabIndex) ?? model.seriesPanel;
    return (
      <SeriesStatsView
        {...panel}
        showSeriesTitle={false}
        showSeriesOverview={panel.showSeriesOverview}
        noGutter={true}
        wide={true}
        onAnalyticsTabSelected={onAnalyticsTabSelected}
      />
    );
  };
  const settingsUi = model.showPreview ? (
    <div className={styles.previewControls}>
      <Button onClick={onExitPreview} variant="primary">
        Exit preview
      </Button>
    </div>
  ) : null;

  return (
    <div data-testid="archive-streamer-overlay">
      <StreamerOverlaySection
        topSection={topSection}
        teamColors={[...model.teamColors]}
        tabs={model.tabs}
        tickerMatchGroups={model.tickerMatchGroups}
        showTabs={model.showTabs}
        showTicker={model.showTicker}
        matchesLength={model.matchesLength}
        showPreview={model.showPreview}
        previewMode="observer"
        fontSizeStyles={model.fontSizeStyles}
        settingsUi={settingsUi}
        hasPanelContent={hasPanelContent}
        renderPanelContent={renderPanelContent}
      />
    </div>
  );
}
