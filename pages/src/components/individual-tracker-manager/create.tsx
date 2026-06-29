import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import { IndividualTrackerStore } from "./individual-tracker-store";
import { IndividualTrackerShell } from "./individual-tracker";
import { createLiveTrackersSection } from "./live-trackers/create";
import { StatsHighlightsSection } from "./stats-highlights/create";
import { StreamerConnectionsPresenter } from "./streamer-connections/streamer-connections-presenter";
import { StreamerConnectionsSectionView } from "./streamer-connections/streamer-connections";
import { StreamerConnectionsStore } from "./streamer-connections/streamer-connections-store";

interface IndividualTrackerManagerPageProps {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

export function IndividualTrackerManagerPage({
  authService,
  individualTrackerService,
  settingsService,
  individualTrackerViewService,
}: IndividualTrackerManagerPageProps): React.ReactElement {
  const { controller: liveTrackersController, Component: LiveTrackersComponent } = useMemo(
    () =>
      createLiveTrackersSection({
        individualTrackerService,
        individualTrackerViewService,
        navigateTo: (url): void => {
          window.location.assign(url);
        },
        confirmDelete: (message): boolean => window.confirm(message),
      }),
    [individualTrackerService, individualTrackerViewService],
  );

  const store = useMemo(() => new IndividualTrackerStore(), []);
  const settingsStore = useMemo(() => new StreamerConnectionsStore(), []);
  const settingsPresenter = useMemo(
    () => new StreamerConnectionsPresenter({ settingsService, store: settingsStore }),
    [settingsService, settingsStore],
  );

  const presenter = useMemo(
    () =>
      new IndividualTrackerPresenter({
        authService,
        settingsService,
        store,
        liveTrackersController,
      }),
    [authService, settingsService, store, liveTrackersController],
  );

  useEffect(() => {
    presenter.start();
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => presenter.subscribe(listener),
    () => presenter.getSnapshot(),
    () => presenter.getSnapshot(),
  );

  useEffect(() => {
    settingsPresenter.loadSettings(snapshot.streamerSettings, snapshot.gamertag);
  }, [settingsPresenter, snapshot.streamerSettings, snapshot.gamertag]);

  useEffect(() => {
    return (): void => {
      settingsPresenter.dispose();
    };
  }, [settingsPresenter]);

  const settingsSnapshot = useSyncExternalStore(
    (listener) => settingsStore.subscribe(listener),
    () => settingsStore.getSnapshot(),
    () => settingsStore.getSnapshot(),
  );

  const onStatsHighlightSlotsChange = useCallback(
    (statsHighlightSlots: Parameters<StreamerConnectionsPresenter["setStatsHighlightSlots"]>[0]): void => {
      settingsPresenter.setStatsHighlightSlots(statsHighlightSlots);
    },
    [settingsPresenter],
  );

  return (
    <IndividualTrackerShell
      authState={snapshot.authState}
      errorMessage={snapshot.errorMessage}
      activeSection={snapshot.activeSection}
      onSignIn={(): void => {
        presenter.signIn();
      }}
      onSectionChange={(id): void => {
        presenter.setActiveSection(id);
      }}
      liveTrackersContent={<LiveTrackersComponent />}
      statsHighlightsContent={
        <StatsHighlightsSection
          statsHighlightSlots={settingsSnapshot.statsHighlightSlots}
          saveStatus={settingsSnapshot.saveStatus}
          saveErrorMessage={settingsSnapshot.saveErrorMessage}
          onStatsHighlightSlotsChange={onStatsHighlightSlotsChange}
        />
      }
      streamerSettingsContent={
        <StreamerConnectionsSectionView
          gamertag={settingsSnapshot.gamertag}
          defaultColorMode={settingsSnapshot.defaultColorMode}
          playerTeamColor={settingsSnapshot.playerTeamColor}
          playerEnemyColor={settingsSnapshot.playerEnemyColor}
          observerTeamColor={settingsSnapshot.observerTeamColor}
          observerEnemyColor={settingsSnapshot.observerEnemyColor}
          displaySettings={settingsSnapshot.displaySettings}
          tickerSettings={settingsSnapshot.tickerSettings}
          fontSizeSettings={settingsSnapshot.fontSizeSettings}
          saveStatus={settingsSnapshot.saveStatus}
          saveErrorMessage={settingsSnapshot.saveErrorMessage}
          onDefaultColorModeChange={(mode): void => {
            settingsPresenter.setDefaultColorMode(mode);
          }}
          onPlayerColorsChange={(teamColor, enemyColor): void => {
            settingsPresenter.setPlayerColors(teamColor, enemyColor);
          }}
          onObserverColorsChange={(teamColor, enemyColor): void => {
            settingsPresenter.setObserverColors(teamColor, enemyColor);
          }}
          onDisplaySettingsChange={(updates): void => {
            settingsPresenter.setDisplaySettings(updates);
          }}
          onTickerSettingsChange={(updates): void => {
            settingsPresenter.setTickerSettings(updates);
          }}
          onFontSizesChange={(updates): void => {
            settingsPresenter.setFontSizes(updates);
          }}
        />
      }
    />
  );
}
