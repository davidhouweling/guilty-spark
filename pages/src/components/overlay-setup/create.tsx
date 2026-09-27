import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { Alert } from "../alert/alert";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { OverlayPreviewService } from "../../services/individual-tracker/overlay-preview-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { createOverlayUrlsSection } from "../overlay-urls/create";
import { createStatsHighlightsSection } from "../stats-highlights/create";
import { snapshotToSettings, StreamerSettingsPresenter } from "../streamer-settings/streamer-settings-presenter";
import { StreamerSettingsSectionView } from "../streamer-settings/streamer-settings";
import { StreamerSettingsStore } from "../streamer-settings/streamer-settings-store";
import { createIndividualTrackerOverlayPage } from "../individual-tracker/overlay/create";
import { createIndividualTrackerViewerPage } from "../individual-tracker/viewer/create";
import { CapabilityPreview } from "./capability-preview";
import type { CapabilityPreviewTab } from "./capability-preview";
import { CapabilityPreviewPresenter } from "./capability-preview-presenter";
import { CapabilityPreviewStore } from "./capability-preview-store";
import { OVERLAY_SETUP_DEMO_GAMERTAG, OverlaySetupPresenter } from "./overlay-setup-presenter";
import { OverlaySetupStore } from "./overlay-setup-store";
import { OverlaySetupShell } from "./overlay-setup";
import styles from "./overlay-setup.module.css";

export interface CreateOverlaySetupPageConfig {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly haloClient: HaloInfiniteClient;
  readonly overlayPreviewService: OverlayPreviewService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly apiHost: string;
}

function buildSignInHref(apiHost: string): string {
  const startUrl = new URL("/auth/microsoft/start", apiHost);
  startUrl.searchParams.set("redirect", "/stream-overlay");
  return startUrl.toString();
}

interface OverlaySetupPageInternalProps {
  readonly presenter: OverlaySetupPresenter;
  readonly previewPresenter: CapabilityPreviewPresenter;
  readonly previewStore: CapabilityPreviewStore;
  readonly settingsPresenter: StreamerSettingsPresenter;
  readonly settingsStore: StreamerSettingsStore;
  readonly OverlayPage: ReturnType<typeof createIndividualTrackerOverlayPage>;
  readonly ViewerPage: ReturnType<typeof createIndividualTrackerViewerPage>;
  readonly apiHost: string;
  readonly StatsHighlightsSection: ReturnType<typeof createStatsHighlightsSection>;
}

function OverlaySetupPageInternal({
  presenter,
  previewPresenter,
  previewStore,
  settingsPresenter,
  settingsStore,
  OverlayPage,
  ViewerPage,
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
    if (snapshot.authState === "loading") {
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
      previewPresenter.dispose();
    };
  }, [previewPresenter, settingsPresenter]);

  const settingsSnapshot = useSyncExternalStore(
    (listener) => settingsStore.subscribe(listener),
    () => settingsStore.getSnapshot(),
    () => settingsStore.getSnapshot(),
  );
  const previewStreamerSettings = useMemo(() => snapshotToSettings(settingsSnapshot), [settingsSnapshot]);
  const previewSettingsReady = settingsSnapshot.loadStatus === "loaded" || settingsSnapshot.loadStatus === "error";
  const previewIdentityKey =
    snapshot.authState === "authenticated" ? `authenticated:${snapshot.gamertag ?? ""}` : "demo";
  const onPreviewModeSelected = useMemo(
    () =>
      (tab: CapabilityPreviewTab): void => {
        if (!previewSettingsReady) {
          return;
        }
        previewPresenter.load(tab === "viewer" ? "matchmaking" : tab, previewStreamerSettings, previewIdentityKey);
      },
    [previewIdentityKey, previewPresenter, previewSettingsReady, previewStreamerSettings],
  );
  useEffect(() => {
    if (snapshot.authState === "loading" || !previewSettingsReady) {
      return;
    }
    previewPresenter.updateSettings(previewStreamerSettings, previewIdentityKey);
  }, [previewIdentityKey, previewPresenter, previewSettingsReady, previewStreamerSettings, snapshot.authState]);

  const previewSnapshot = useSyncExternalStore(
    (listener) => previewStore.subscribe(listener),
    () => previewStore.getSnapshot(),
    () => previewStore.getSnapshot(),
  );
  const OverlayUrlsSection = useMemo(() => createOverlayUrlsSection(), []);

  const isDemo = snapshot.authState !== "authenticated";
  const settingsLoading = settingsSnapshot.loadStatus !== "loaded";
  const settingsFormDisabled = settingsLoading;
  const settingsContent =
    settingsSnapshot.loadStatus === "idle" || settingsSnapshot.loadStatus === "loading" ? (
      <Alert variant="info">Loading your saved overlay settings…</Alert>
    ) : settingsSnapshot.loadStatus === "error" ? (
      <Alert variant="error">{settingsSnapshot.loadErrorMessage ?? "Failed to load settings"}</Alert>
    ) : (
      <>
        {isDemo ? (
          <Alert variant="info">
            Try the controls to see them in the preview. Changes are not saved — sign in to keep them.
          </Alert>
        ) : null}
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
          gamertag={snapshot.gamertag ?? OVERLAY_SETUP_DEMO_GAMERTAG}
          previewColorMode={settingsSnapshot.defaultColorMode}
          autoStart={settingsSnapshot.autoStart}
          disabled={isDemo}
          settingsDisabled={settingsLoading}
          loading={snapshot.authState === "loading"}
          onAutoStartChange={(enabled): void => {
            settingsPresenter.setAutoStart(enabled);
          }}
        />
      }
      previewContent={
        <CapabilityPreview
          gamertag={snapshot.gamertag}
          isAuthenticated={snapshot.authState === "authenticated"}
          settingsReady={previewSettingsReady}
          previewMode={settingsSnapshot.defaultColorMode}
          streamerSettings={previewStreamerSettings}
          matchmaking={previewSnapshot.matchmaking}
          series={previewSnapshot.series}
          OverlayPage={OverlayPage}
          ViewerPage={ViewerPage}
          onActivateMode={onPreviewModeSelected}
          onRetry={(mode): void => {
            previewPresenter.retry(
              mode === "viewer" ? "matchmaking" : mode,
              previewStreamerSettings,
              previewIdentityKey,
            );
          }}
        />
      }
      configureContent={
        <fieldset disabled={settingsFormDisabled} className={styles.settingsFieldset} aria-label="Overlay settings">
          {settingsContent}
        </fieldset>
      }
    />
  );
}

export function createOverlaySetupPage(config: CreateOverlaySetupPageConfig): () => ReactElement {
  const Component = (): ReactElement => {
    const store = useMemo(() => new OverlaySetupStore(), []);
    const previewStore = useMemo(() => new CapabilityPreviewStore(), []);
    const settingsStore = useMemo(() => new StreamerSettingsStore(), []);
    const StatsHighlightsSection = useMemo(() => createStatsHighlightsSection(), []);
    const presenter = useMemo(() => new OverlaySetupPresenter({ authService: config.authService, store }), [store]);
    const previewSeriesMatchesService = useMemo<SeriesMatchesService>(
      () => ({
        getSeriesMatches: async (
          matchIds,
          _trackerId,
          anchorMatchId,
        ): ReturnType<SeriesMatchesService["getSeriesMatches"]> =>
          config.seriesMatchesService.getSeriesMatches(matchIds, undefined, anchorMatchId),
      }),
      [config.seriesMatchesService],
    );
    const previewMatchAnalyticsService = useMemo<MatchAnalyticsService>(
      () => ({
        getBatchMatchAnalytics: async (
          matchIds,
          modules,
        ): ReturnType<MatchAnalyticsService["getBatchMatchAnalytics"]> =>
          config.matchAnalyticsService.getBatchMatchAnalytics(matchIds, modules),
      }),
      [config.matchAnalyticsService],
    );
    const OverlayPage = useMemo(
      () =>
        createIndividualTrackerOverlayPage({
          individualTrackerViewService: config.individualTrackerViewService,
          matchAnalyticsService: previewMatchAnalyticsService,
          seriesMatchesService: previewSeriesMatchesService,
          haloClient: config.haloClient,
          medalMetadataResolver: config.medalMetadataResolver,
        }),
      [
        config.individualTrackerViewService,
        previewMatchAnalyticsService,
        previewSeriesMatchesService,
        config.haloClient,
        config.medalMetadataResolver,
      ],
    );
    const ViewerPage = useMemo(
      () =>
        createIndividualTrackerViewerPage({
          individualTrackerViewService: config.individualTrackerViewService,
          matchAnalyticsService: previewMatchAnalyticsService,
          seriesMatchesService: previewSeriesMatchesService,
          medalMetadataResolver: config.medalMetadataResolver,
        }),
      [
        config.individualTrackerViewService,
        previewMatchAnalyticsService,
        previewSeriesMatchesService,
        config.medalMetadataResolver,
      ],
    );
    const previewPresenter = useMemo(
      () =>
        new CapabilityPreviewPresenter({
          previewService: config.overlayPreviewService,
          store: previewStore,
        }),
      [config.overlayPreviewService, previewStore],
    );
    const settingsPresenter = useMemo(
      () => new StreamerSettingsPresenter({ settingsService: config.settingsService, store: settingsStore }),
      [settingsStore],
    );

    return (
      <OverlaySetupPageInternal
        presenter={presenter}
        previewPresenter={previewPresenter}
        previewStore={previewStore}
        settingsPresenter={settingsPresenter}
        settingsStore={settingsStore}
        OverlayPage={OverlayPage}
        ViewerPage={ViewerPage}
        apiHost={config.apiHost}
        StatsHighlightsSection={StatsHighlightsSection}
      />
    );
  };

  return Component;
}
