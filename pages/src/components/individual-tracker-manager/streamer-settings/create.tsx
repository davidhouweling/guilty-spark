import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import { StreamerSettingsPresenter } from "./streamer-settings-presenter";
import { StreamerSettingsStore } from "./streamer-settings-store";
import { StreamerSettingsSectionView } from "./streamer-settings";

interface StreamerSettingsSectionProps {
  readonly settings: StreamerViewSettings;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly gamertag: string | null;
}

export function StreamerSettingsSection({
  settings,
  settingsService,
  gamertag,
}: StreamerSettingsSectionProps): React.ReactElement {
  const store = useMemo(() => new StreamerSettingsStore(), []);
  const presenter = useMemo(() => new StreamerSettingsPresenter({ settingsService, store }), [settingsService, store]);

  useEffect(() => {
    presenter.loadSettings(settings, gamertag);
  }, [presenter, settings, gamertag]);

  useEffect(() => {
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  return (
    <StreamerSettingsSectionView
      gamertag={snapshot.gamertag}
      defaultColorMode={snapshot.defaultColorMode}
      playerTeamColor={snapshot.playerTeamColor}
      playerEnemyColor={snapshot.playerEnemyColor}
      observerTeamColor={snapshot.observerTeamColor}
      observerEnemyColor={snapshot.observerEnemyColor}
      displaySettings={snapshot.displaySettings}
      tickerSettings={snapshot.tickerSettings}
      inSeriesShowSeriesTab={snapshot.inSeriesShowSeriesTab}
      matchmakingShowSummaryTab={snapshot.matchmakingShowSummaryTab}
      disableTeamPlayerNames={snapshot.disableTeamPlayerNames}
      inSeriesShowTicker={snapshot.inSeriesShowTicker}
      matchmakingShowTicker={snapshot.matchmakingShowTicker}
      matchmakingShowStatsHighlights={snapshot.matchmakingShowStatsHighlights}
      inSeriesMyStatsOnly={snapshot.inSeriesMyStatsOnly}
      matchmakingMyStatsOnly={snapshot.matchmakingMyStatsOnly}
      fontSizeSettings={snapshot.fontSizeSettings}
      saveStatus={snapshot.saveStatus}
      saveErrorMessage={snapshot.saveErrorMessage}
      onDefaultColorModeChange={(mode): void => {
        presenter.setDefaultColorMode(mode);
      }}
      onPlayerColorsChange={(teamColor, enemyColor): void => {
        presenter.setPlayerColors(teamColor, enemyColor);
      }}
      onObserverColorsChange={(teamColor, enemyColor): void => {
        presenter.setObserverColors(teamColor, enemyColor);
      }}
      onDisplaySettingsChange={(updates): void => {
        presenter.setDisplaySettings(updates);
      }}
      onTickerSettingsChange={(updates): void => {
        presenter.setTickerSettings(updates);
      }}
      onInSeriesShowSeriesTabChange={(enabled): void => {
        presenter.setInSeriesShowSeriesTab(enabled);
      }}
      onMatchmakingShowSummaryTabChange={(enabled): void => {
        presenter.setMatchmakingShowSummaryTab(enabled);
      }}
      onDisableTeamPlayerNamesChange={(enabled): void => {
        presenter.setDisableTeamPlayerNames(enabled);
      }}
      onInSeriesShowTickerChange={(enabled): void => {
        presenter.setInSeriesShowTicker(enabled);
      }}
      onMatchmakingShowTickerChange={(enabled): void => {
        presenter.setMatchmakingShowTicker(enabled);
      }}
      onMatchmakingShowStatsHighlightsChange={(enabled): void => {
        presenter.setMatchmakingShowStatsHighlights(enabled);
      }}
      onInSeriesMyStatsOnlyChange={(enabled): void => {
        presenter.setInSeriesMyStatsOnly(enabled);
      }}
      onMatchmakingMyStatsOnlyChange={(enabled): void => {
        presenter.setMatchmakingMyStatsOnly(enabled);
      }}
      onFontSizesChange={(updates): void => {
        presenter.setFontSizes(updates);
      }}
    />
  );
}
