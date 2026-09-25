import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import classNames from "classnames";
import { Alert } from "../alert/alert";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import { createOverlayUrlsSection } from "../overlay-urls/create";
import { createStatsHighlightsSection } from "../stats-highlights/create";
import { StreamerSettingsPresenter } from "../streamer-settings/streamer-settings-presenter";
import { StreamerSettingsSectionView } from "../streamer-settings/streamer-settings";
import { StreamerSettingsStore } from "../streamer-settings/streamer-settings-store";
import { OVERLAY_SETUP_DEMO_GAMERTAG, OverlaySetupPresenter } from "./overlay-setup-presenter";
import { OverlaySetupStore } from "./overlay-setup-store";
import { OverlaySetupShell } from "./overlay-setup";
import styles from "./overlay-setup.module.css";

export interface CreateOverlaySetupPageConfig {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly apiHost: string;
}

function buildSignInHref(apiHost: string): string {
  const startUrl = new URL("/auth/microsoft/start", apiHost);
  startUrl.searchParams.set("redirect", "/stream-overlay");
  return startUrl.toString();
}

interface OverlaySetupPageInternalProps {
  readonly presenter: OverlaySetupPresenter;
  readonly settingsPresenter: StreamerSettingsPresenter;
  readonly settingsStore: StreamerSettingsStore;
  readonly apiHost: string;
  readonly StatsHighlightsSection: ReturnType<typeof createStatsHighlightsSection>;
}

function OverlaySetupPageInternal({
  presenter,
  settingsPresenter,
  settingsStore,
  apiHost,
  StatsHighlightsSection,
}: OverlaySetupPageInternalProps): ReactElement {
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
    if (snapshot.authState === "loading" || snapshot.authState === "error") {
      return;
    }
    if (snapshot.authState === "authenticated") {
      settingsPresenter.loadSettingsFromService(snapshot.gamertag);
      return;
    }
    settingsPresenter.loadDemoSettings(snapshot.gamertag ?? OVERLAY_SETUP_DEMO_GAMERTAG);
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
  const OverlayUrlsSection = useMemo(() => createOverlayUrlsSection(), []);

  const isDemo = snapshot.authState !== "authenticated";
  const settingsDisabled = isDemo || settingsSnapshot.loadStatus !== "loaded";
  const settingsContent =
    snapshot.authState === "error" ? (
      <Alert variant="error">{snapshot.errorMessage ?? "Failed to load session."}</Alert>
    ) : settingsSnapshot.loadStatus === "idle" || settingsSnapshot.loadStatus === "loading" ? (
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
    <OverlaySetupShell
      authState={snapshot.authState}
      gamertag={snapshot.gamertag}
      avatarUrl={snapshot.avatarUrl}
      signInHref={buildSignInHref(apiHost)}
      errorMessage={snapshot.errorMessage}
      onRetry={(): void => {
        presenter.start();
      }}
      overlayUrlsContent={
        <OverlayUrlsSection
          gamertag={snapshot.gamertag}
          previewColorMode={settingsSnapshot.defaultColorMode}
          autoStart={settingsSnapshot.autoStart}
          disabled={settingsDisabled}
          errorMessage={snapshot.authState === "error" ? snapshot.errorMessage : null}
          isDemo={isDemo}
          loading={snapshot.authState === "loading"}
          onAutoStartChange={(enabled): void => {
            settingsPresenter.setAutoStart(enabled);
          }}
        />
      }
      configureContent={
        <fieldset
          disabled={settingsDisabled}
          className={classNames(styles.settingsFieldset, isDemo && styles.demoLocked)}
          aria-label="Overlay settings"
        >
          {settingsContent}
        </fieldset>
      }
    />
  );
}

export function createOverlaySetupPage(config: CreateOverlaySetupPageConfig): () => ReactElement {
  const Component = (): ReactElement => {
    const store = useMemo(() => new OverlaySetupStore(), []);
    const settingsStore = useMemo(() => new StreamerSettingsStore(), []);
    const StatsHighlightsSection = useMemo(() => createStatsHighlightsSection(), []);
    const presenter = useMemo(() => new OverlaySetupPresenter({ authService: config.authService, store }), [store]);
    const settingsPresenter = useMemo(
      () => new StreamerSettingsPresenter({ settingsService: config.settingsService, store: settingsStore }),
      [settingsStore],
    );

    return (
      <OverlaySetupPageInternal
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
