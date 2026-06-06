import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import { StreamerConnectionsPresenter } from "./streamer-connections-presenter";
import { StreamerConnectionsStore } from "./streamer-connections-store";
import { StreamerConnectionsSectionView } from "./streamer-connections";

interface StreamerConnectionsSectionProps {
  readonly settings: StreamerViewSettings;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly gamertag: string | null;
}

export function StreamerConnectionsSection({
  settings,
  settingsService,
  gamertag,
}: StreamerConnectionsSectionProps): React.ReactElement {
  const store = useMemo(() => new StreamerConnectionsStore(), []);
  const presenter = useMemo(
    () => new StreamerConnectionsPresenter({ settingsService, store }),
    [settingsService, store],
  );

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
    <StreamerConnectionsSectionView
      gamertag={snapshot.gamertag}
      defaultColorMode={snapshot.defaultColorMode}
      playerTeamColor={snapshot.playerTeamColor}
      playerEnemyColor={snapshot.playerEnemyColor}
      observerTeamColor={snapshot.observerTeamColor}
      observerEnemyColor={snapshot.observerEnemyColor}
      displaySettings={snapshot.displaySettings}
      tickerSettings={snapshot.tickerSettings}
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
      onFontSizesChange={(updates): void => {
        presenter.setFontSizes(updates);
      }}
    />
  );
}
