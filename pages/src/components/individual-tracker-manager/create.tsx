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
import { StreamerSettingsPresenter } from "./streamer-settings/streamer-settings-presenter";
import { StreamerSettingsSectionView } from "./streamer-settings/streamer-settings";
import { StreamerSettingsStore } from "./streamer-settings/streamer-settings-store";

export interface CreateIndividualTrackerManagerPageConfig {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

interface IndividualTrackerManagerPageInternalProps {
  readonly presenter: IndividualTrackerPresenter;
  readonly settingsPresenter: StreamerSettingsPresenter;
  readonly settingsStore: StreamerSettingsStore;
  readonly LiveTrackersComponent: () => React.ReactElement;
}

function IndividualTrackerManagerPageInternal({
  presenter,
  settingsPresenter,
  settingsStore,
  LiveTrackersComponent,
}: IndividualTrackerManagerPageInternalProps): React.ReactElement {
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
    (statsHighlightSlots: Parameters<StreamerSettingsPresenter["setStatsHighlightSlots"]>[0]): void => {
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
        <StreamerSettingsSectionView
          gamertag={settingsSnapshot.gamertag}
          defaultColorMode={settingsSnapshot.defaultColorMode}
          playerTeamColor={settingsSnapshot.playerTeamColor}
          playerEnemyColor={settingsSnapshot.playerEnemyColor}
          observerTeamColor={settingsSnapshot.observerTeamColor}
          observerEnemyColor={settingsSnapshot.observerEnemyColor}
          displaySettings={settingsSnapshot.displaySettings}
          tickerSettings={settingsSnapshot.tickerSettings}
          inSeriesShowSeriesTab={settingsSnapshot.inSeriesShowSeriesTab}
          matchmakingShowSummaryTab={settingsSnapshot.matchmakingShowSummaryTab}
          disableTeamPlayerNames={settingsSnapshot.disableTeamPlayerNames}
          inSeriesShowTicker={settingsSnapshot.inSeriesShowTicker}
          matchmakingShowTicker={settingsSnapshot.matchmakingShowTicker}
          matchmakingShowStatsHighlights={settingsSnapshot.matchmakingShowStatsHighlights}
          inSeriesMyStatsOnly={settingsSnapshot.inSeriesMyStatsOnly}
          matchmakingMyStatsOnly={settingsSnapshot.matchmakingMyStatsOnly}
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
          onInSeriesShowSeriesTabChange={(enabled): void => {
            settingsPresenter.setInSeriesShowSeriesTab(enabled);
          }}
          onMatchmakingShowSummaryTabChange={(enabled): void => {
            settingsPresenter.setMatchmakingShowSummaryTab(enabled);
          }}
          onDisableTeamPlayerNamesChange={(enabled): void => {
            settingsPresenter.setDisableTeamPlayerNames(enabled);
          }}
          onInSeriesShowTickerChange={(enabled): void => {
            settingsPresenter.setInSeriesShowTicker(enabled);
          }}
          onMatchmakingShowTickerChange={(enabled): void => {
            settingsPresenter.setMatchmakingShowTicker(enabled);
          }}
          onMatchmakingShowStatsHighlightsChange={(enabled): void => {
            settingsPresenter.setMatchmakingShowStatsHighlights(enabled);
          }}
          onInSeriesMyStatsOnlyChange={(enabled): void => {
            settingsPresenter.setInSeriesMyStatsOnly(enabled);
          }}
          onMatchmakingMyStatsOnlyChange={(enabled): void => {
            settingsPresenter.setMatchmakingMyStatsOnly(enabled);
          }}
          onFontSizesChange={(updates): void => {
            settingsPresenter.setFontSizes(updates);
          }}
        />
      }
    />
  );
}

export function createIndividualTrackerManagerPage(
  config: CreateIndividualTrackerManagerPageConfig,
): () => React.ReactElement {
  const { controller: liveTrackersController, Component: LiveTrackersComponent } = createLiveTrackersSection({
    individualTrackerService: config.individualTrackerService,
    individualTrackerViewService: config.individualTrackerViewService,
    navigateTo: (url): void => {
      window.location.assign(url);
    },
    confirmDelete: (message): boolean => window.confirm(message),
  });

  const Component = (): React.ReactElement => {
    const store = useMemo(() => new IndividualTrackerStore(), []);
    const settingsStore = useMemo(() => new StreamerSettingsStore(), []);
    const settingsPresenter = useMemo(
      () => new StreamerSettingsPresenter({ settingsService: config.settingsService, store: settingsStore }),
      [settingsStore],
    );
    const presenter = useMemo(
      () =>
        new IndividualTrackerPresenter({
          authService: config.authService,
          settingsService: config.settingsService,
          store,
          liveTrackersController,
        }),
      [store],
    );

    return (
      <IndividualTrackerManagerPageInternal
        presenter={presenter}
        settingsPresenter={settingsPresenter}
        settingsStore={settingsStore}
        LiveTrackersComponent={LiveTrackersComponent}
      />
    );
  };

  return Component;
}
