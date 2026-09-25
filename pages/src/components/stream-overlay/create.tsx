import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { Alert } from "../alert/alert";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import { OverlayUrlsSection } from "../individual-tracker/overlay-urls/overlay-urls";
import { createStatsHighlightsSection } from "../stats-highlights/create";
import { StreamerSettingsPresenter } from "../streamer-settings/streamer-settings-presenter";
import { StreamerSettingsSectionView } from "../streamer-settings/streamer-settings";
import { StreamerSettingsStore } from "../streamer-settings/streamer-settings-store";
import { STREAM_OVERLAY_DEMO_GAMERTAG, StreamOverlayPresenter } from "./stream-overlay-presenter";
import { StreamOverlayStore } from "./stream-overlay-store";
import { StreamOverlayShell } from "./stream-overlay";
import styles from "./stream-overlay.module.css";

export interface CreateStreamOverlayPageConfig {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly apiHost: string;
}

function buildSignInHref(apiHost: string): string {
  const startUrl = new URL("/auth/microsoft/start", apiHost);
  startUrl.searchParams.set("redirect", "/stream-overlay");
  return startUrl.toString();
}

interface StreamOverlayPageInternalProps {
  readonly presenter: StreamOverlayPresenter;
  readonly settingsPresenter: StreamerSettingsPresenter;
  readonly settingsStore: StreamerSettingsStore;
  readonly apiHost: string;
  readonly StatsHighlightsSection: ReturnType<typeof createStatsHighlightsSection>;
}

function StreamOverlayPageInternal({
  presenter,
  settingsPresenter,
  settingsStore,
  apiHost,
  StatsHighlightsSection,
}: StreamOverlayPageInternalProps): ReactElement {
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
    if (snapshot.authState === "loading") {
      return;
    }
    if (snapshot.authState === "authenticated") {
      settingsPresenter.loadSettingsFromService(snapshot.gamertag);
      return;
    }
    settingsPresenter.loadDemoSettings(snapshot.gamertag ?? STREAM_OVERLAY_DEMO_GAMERTAG);
  }, [settingsPresenter, snapshot.authState, snapshot.gamertag]);

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

  const isDemo = snapshot.authState !== "authenticated";
  const settingsDisabled = isDemo || settingsSnapshot.loadStatus !== "loaded";
  const settingsContent =
    settingsSnapshot.loadStatus === "idle" || settingsSnapshot.loadStatus === "loading" ? (
      <Alert variant="info">Loading your saved overlay settings…</Alert>
    ) : settingsSnapshot.loadStatus === "error" ? (
      <Alert variant="error">{settingsSnapshot.loadErrorMessage ?? "Failed to load settings"}</Alert>
    ) : (
      <>
        <StatsHighlightsSection
          statsHighlightSlots={settingsSnapshot.statsHighlightSlots}
          saveStatus="idle"
          saveErrorMessage={null}
          onStatsHighlightSlotsChange={(slots): void => {
            settingsPresenter.setStatsHighlightSlots(slots);
          }}
        />
        <StreamerSettingsSectionView
          defaultColorMode={settingsSnapshot.defaultColorMode}
          playerTeamColor={settingsSnapshot.playerTeamColor}
          playerEnemyColor={settingsSnapshot.playerEnemyColor}
          observerTeamColor={settingsSnapshot.observerTeamColor}
          observerEnemyColor={settingsSnapshot.observerEnemyColor}
          displaySettings={settingsSnapshot.displaySettings}
          tickerSettings={settingsSnapshot.tickerSettings}
          inSeriesShowSeriesTab={settingsSnapshot.inSeriesShowSeriesTab}
          matchmakingShowSummaryTab={settingsSnapshot.matchmakingShowSummaryTab}
          inSeriesShowTabs={settingsSnapshot.inSeriesShowTabs}
          matchmakingShowTabs={settingsSnapshot.matchmakingShowTabs}
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
          onInSeriesShowTabsChange={(enabled): void => {
            settingsPresenter.setInSeriesShowTabs(enabled);
          }}
          onMatchmakingShowTabsChange={(enabled): void => {
            settingsPresenter.setMatchmakingShowTabs(enabled);
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
      </>
    );

  return (
    <StreamOverlayShell
      authState={snapshot.authState}
      gamertag={snapshot.gamertag}
      avatarUrl={snapshot.avatarUrl}
      signInHref={buildSignInHref(apiHost)}
      errorMessage={snapshot.errorMessage}
      overlayUrlsContent={
        <OverlayUrlsSection
          gamertag={snapshot.gamertag}
          previewColorMode={settingsSnapshot.defaultColorMode}
          autoStart={settingsSnapshot.autoStart}
          disabled={settingsDisabled}
          onAutoStartChange={(enabled): void => {
            settingsPresenter.setAutoStart(enabled);
          }}
        />
      }
      configureContent={
        <fieldset
          disabled={settingsDisabled}
          className={isDemo ? styles.demoLocked : undefined}
          aria-label="Overlay settings"
        >
          {isDemo ? (
            <>
              <StatsHighlightsSection
                statsHighlightSlots={settingsSnapshot.statsHighlightSlots}
                saveStatus="idle"
                saveErrorMessage={null}
                onStatsHighlightSlotsChange={(slots): void => {
                  settingsPresenter.setStatsHighlightSlots(slots);
                }}
              />
              <StreamerSettingsSectionView
                defaultColorMode={settingsSnapshot.defaultColorMode}
                playerTeamColor={settingsSnapshot.playerTeamColor}
                playerEnemyColor={settingsSnapshot.playerEnemyColor}
                observerTeamColor={settingsSnapshot.observerTeamColor}
                observerEnemyColor={settingsSnapshot.observerEnemyColor}
                displaySettings={settingsSnapshot.displaySettings}
                tickerSettings={settingsSnapshot.tickerSettings}
                inSeriesShowSeriesTab={settingsSnapshot.inSeriesShowSeriesTab}
                matchmakingShowSummaryTab={settingsSnapshot.matchmakingShowSummaryTab}
                inSeriesShowTabs={settingsSnapshot.inSeriesShowTabs}
                matchmakingShowTabs={settingsSnapshot.matchmakingShowTabs}
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
                onInSeriesShowTabsChange={(enabled): void => {
                  settingsPresenter.setInSeriesShowTabs(enabled);
                }}
                onMatchmakingShowTabsChange={(enabled): void => {
                  settingsPresenter.setMatchmakingShowTabs(enabled);
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
            </>
          ) : (
            settingsContent
          )}
        </fieldset>
      }
    />
  );
}

export function createStreamOverlayPage(config: CreateStreamOverlayPageConfig): () => ReactElement {
  const Component = (): ReactElement => {
    const store = useMemo(() => new StreamOverlayStore(), []);
    const settingsStore = useMemo(() => new StreamerSettingsStore(), []);
    const StatsHighlightsSection = useMemo(() => createStatsHighlightsSection(), []);
    const presenter = useMemo(() => new StreamOverlayPresenter({ authService: config.authService, store }), [store]);
    const settingsPresenter = useMemo(
      () => new StreamerSettingsPresenter({ settingsService: config.settingsService, store: settingsStore }),
      [settingsStore],
    );

    return (
      <StreamOverlayPageInternal
        presenter={presenter}
        settingsPresenter={settingsPresenter}
        settingsStore={settingsStore}
        apiHost={config.apiHost}
        StatsHighlightsSection={StatsHighlightsSection}
      />
    );
  };

  return Component;
}
