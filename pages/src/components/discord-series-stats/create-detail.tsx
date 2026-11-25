import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import type { SeriesMatchAnalyticsById } from "../series-stats/types";
import { SeriesDetailStatsViewModelPresenter } from "../series-stats/series-detail-stats-view-model-presenter";
import type { ViewMode } from "../view-mode/view-mode-selector";
import type {
  AllStreamerSettings,
  ObserverViewColorSettings,
  SeriesStreamerSettings,
} from "../live-tracker/settings/types";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import { SettingsTrigger } from "../live-tracker/settings/settings-trigger";
import { presentArchiveSeriesColors } from "./archive-series-colors";
import { DiscordSeriesStatsView } from "./discord-series-stats";
import { ArchiveSeriesOverlay } from "./archive-overlay";
import { ArchiveSeriesOverlayPresenter } from "./archive-series-overlay-presenter";
import { ArchiveSettingsDialog } from "./settings/archive-settings-dialog";
import type { ArchiveGlobalSettingsUpdates } from "./types";

export interface DiscordSeriesDetailStatsProps {
  readonly data: SeriesDetailResponse;
  readonly analyticsByMatchId: SeriesMatchAnalyticsById;
  readonly viewMode: ViewMode;
  readonly streamerSettings: AllStreamerSettings;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly observerColors: ObserverViewColorSettings;
  readonly onObserverColorsChange: (updates: Partial<ObserverViewColorSettings>) => void;
  readonly onSeriesSettingsChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly onGlobalSettingsChange: (updates: ArchiveGlobalSettingsUpdates) => void;
  readonly onViewPreviewChange: (enabled: boolean) => void;
  readonly onViewModeSelect: (mode: ViewMode) => void;
  readonly onAnalyticsTabSelected: (module: AnalyticsModule, matchId?: string) => void;
}

export function createDiscordSeriesDetailStats(): (props: DiscordSeriesDetailStatsProps) => ReactElement {
  function DiscordSeriesDetailStats({
    data,
    analyticsByMatchId,
    viewMode,
    streamerSettings,
    seriesSettings,
    observerColors,
    onObserverColorsChange,
    onSeriesSettingsChange,
    onGlobalSettingsChange,
    onViewPreviewChange,
    onViewModeSelect,
    onAnalyticsTabSelected,
  }: DiscordSeriesDetailStatsProps): ReactElement {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    useEffect(() => {
      document.body.setAttribute("data-view-mode", viewMode);
      return (): void => {
        document.body.removeAttribute("data-view-mode");
      };
    }, [viewMode]);

    const statsDetailController = useMemo(() => new StatsDetailController(), []);
    const presenter = useMemo(
      () => new SeriesDetailStatsViewModelPresenter(statsDetailController),
      [statsDetailController],
    );
    const archiveOverlayPresenter = useMemo(
      () => new ArchiveSeriesOverlayPresenter(statsDetailController),
      [statsDetailController],
    );
    const colorModel = useMemo(() => presentArchiveSeriesColors(data, observerColors), [data, observerColors]);
    const model = useMemo(() => {
      return presenter.present(data, analyticsByMatchId, {
        teamColors: colorModel.teamColors,
        teamNameOverrides: colorModel.available
          ? [seriesSettings.eagleTeamNameOverride, seriesSettings.cobraTeamNameOverride]
          : [],
      });
    }, [
      analyticsByMatchId,
      colorModel,
      data,
      presenter,
      seriesSettings.cobraTeamNameOverride,
      seriesSettings.eagleTeamNameOverride,
    ]);
    const colorLabels = colorModel.available
      ? {
          first: `${Preconditions.checkExists(model.teams[0], "First series team is missing").name} team color`,
          second: `${Preconditions.checkExists(model.teams[1], "Second series team is missing").name} team color`,
        }
      : null;
    const overlayTeamColors = useMemo(
      () =>
        colorModel.available
          ? colorModel.teamColors
          : [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)],
      [colorModel],
    );
    const archiveOverlayModel = useMemo(
      () =>
        viewMode === "streamer"
          ? archiveOverlayPresenter.present(data, model, streamerSettings, overlayTeamColors, colorModel.available)
          : null,
      [archiveOverlayPresenter, colorModel.available, data, model, overlayTeamColors, streamerSettings, viewMode],
    );

    function openSettings(): void {
      setIsSettingsOpen(true);
    }

    function closeSettings(): void {
      setIsSettingsOpen(false);
    }

    return (
      <>
        {archiveOverlayModel != null ? (
          <ArchiveSeriesOverlay
            model={archiveOverlayModel}
            onAnalyticsTabSelected={onAnalyticsTabSelected}
            settingsUi={<SettingsTrigger compact onClick={openSettings} />}
          />
        ) : (
          <DiscordSeriesStatsView
            {...model}
            title={seriesSettings.titleOverride ?? model.title}
            subtitle={seriesSettings.subtitleOverride ?? model.subtitle}
            viewMode={viewMode}
            stableTeamSlotsAvailable={colorModel.available}
            onOpenSettings={openSettings}
            onAnalyticsTabSelected={onAnalyticsTabSelected}
          />
        )}
        {isSettingsOpen && (
          <ArchiveSettingsDialog
            viewMode={viewMode}
            streamerSettings={streamerSettings}
            seriesSettings={seriesSettings}
            observerColors={observerColors}
            colorLabels={colorLabels}
            defaultTitle={data.context?.title ?? null}
            defaultSubtitle={data.context?.subtitle ?? null}
            onClose={closeSettings}
            onSeriesSettingsChange={onSeriesSettingsChange}
            onGlobalSettingsChange={onGlobalSettingsChange}
            onObserverColorsChange={onObserverColorsChange}
            onViewPreviewChange={onViewPreviewChange}
            onViewModeSelect={onViewModeSelect}
          />
        )}
      </>
    );
  }

  return DiscordSeriesDetailStats;
}
