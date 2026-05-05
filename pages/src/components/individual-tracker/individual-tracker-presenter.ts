import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { StreamerViewStyleFlags } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { Services } from "../../services/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualTrackerSubscription,
  TrackerSearchResult,
  TrackerMatchHistoryResponse,
} from "../../services/individual-tracker/types";
import type { IndividualTrackerAppRoute } from "./routes";
import type { IndividualTrackerSectionId, IndividualTrackerSnapshot } from "./types";
import type { IndividualTrackerStore } from "./individual-tracker-store";
import type { LiveTrackersController } from "./live-trackers/types";
import { buildIndividualTrackerViewerRenderModel } from "./viewer/viewer-render-model";
import { buildIndividualTrackerPublicOverlayPath, buildIndividualTrackerPublicViewPath } from "./routes";

interface Config {
  readonly services: Services;
  readonly store: IndividualTrackerStore;
  readonly liveTrackersController: LiveTrackersController;
  readonly initialRoute: IndividualTrackerAppRoute;
  readonly navigateTo?: (url: string) => void;
  readonly assignLocation?: (url: string) => void;
}

export class IndividualTrackerPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private authenticatedUserId: string | null = null;
  private authenticatedXboxXuid: string | null = null;
  private viewerConnection: IndividualTrackerConnection | null = null;
  private viewerStateSubscription: IndividualTrackerSubscription | null = null;
  private viewerStatusSubscription: IndividualTrackerSubscription | null = null;
  private lastViewerMatchHistoryKey: string | null = null;
  private lastViewerSummaryGamertagKey: string | null = null;
  private viewedTracker: IndividualTrackerState | null = null;
  private viewedTrackerSummary: TrackerSearchResult | null = null;
  private viewedMatchHistory: TrackerMatchHistoryResponse | null = null;
  private viewedMedalMetadata: MedalMetadata = {};
  private currentStreamerStyleFlags: StreamerViewStyleFlags = {};
  private currentRoute: IndividualTrackerAppRoute;

  public constructor(config: Config) {
    this.config = config;
    this.currentRoute = config.initialRoute;
  }

  public start(): void {
    this.config.liveTrackersController.start();
    this.applyRoute(this.currentRoute);
    void this.refresh();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.disposeViewerConnection();
    this.config.liveTrackersController.dispose();
  }

  public subscribe(listener: () => void): () => void {
    this.config.store.subscribers.add(listener);
    return (): void => {
      this.config.store.subscribers.delete(listener);
    };
  }

  public getSnapshot(): IndividualTrackerSnapshot {
    return this.config.store.snapshot;
  }

  public setRoute(route: IndividualTrackerAppRoute): void {
    if (this.isSameRoute(this.currentRoute, route)) {
      return;
    }

    this.currentRoute = route;
    this.applyRoute(route);

    if (this.authenticatedUserId != null && this.getSnapshot().authState === "authenticated") {
      void this.syncViewerForCurrentRoute(this.authenticatedUserId, this.authenticatedXboxXuid);
    }
  }

  public setActiveSection(sectionId: IndividualTrackerSectionId): void {
    this.updateSnapshot((snapshot) => ({ ...snapshot, activeSection: sectionId }));
  }

  public async updateViewerColors(teamColor: string, enemyColor: string): Promise<void> {
    const { profileId } = this.getSnapshot();
    if (profileId == null) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsErrorMessage: "No profile available to save viewer settings.",
      }));
      return;
    }

    const nextTeamColor = this.normalizeColorId(teamColor, this.getSnapshot().viewerTeamColor);
    const nextEnemyColor = this.normalizeColorId(enemyColor, this.getSnapshot().viewerEnemyColor);

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewerTeamColor: nextTeamColor,
      viewerEnemyColor: nextEnemyColor,
      viewerSettingsSaving: true,
      viewerSettingsErrorMessage: null,
    }));

    try {
      await this.config.services.individualTrackerService.updateStreamerViewSettings({
        profileId,
        styleFlags: {
          teamColor: nextTeamColor,
          enemyColor: nextEnemyColor,
        },
      });

      this.currentStreamerStyleFlags = {
        ...this.currentStreamerStyleFlags,
        teamColor: nextTeamColor,
        enemyColor: nextEnemyColor,
      };

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: null,
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: error instanceof Error ? error.message : "Failed to save viewer settings.",
      }));
    }
  }

  public async updateStreamerPresentationSettings(
    defaultColorMode: "player" | "observer",
    showTabs: boolean,
    showTicker: boolean,
    showTeamDetails: boolean,
  ): Promise<void> {
    const { profileId } = this.getSnapshot();
    if (profileId == null) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsErrorMessage: "No profile available to save viewer settings.",
      }));
      return;
    }

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewerDefaultColorMode: defaultColorMode,
      viewerShowTabs: showTabs,
      viewerShowTicker: showTicker,
      viewerShowTeamDetails: showTeamDetails,
      viewerSettingsSaving: true,
      viewerSettingsErrorMessage: null,
    }));

    try {
      await this.config.services.individualTrackerService.updateStreamerViewSettings({
        profileId,
        layoutOptions: {
          defaultColorMode,
        },
        visibleSections: {
          showTabs,
          showTicker,
          showTeamDetails,
        },
      });

      this.currentStreamerStyleFlags = {
        ...this.currentStreamerStyleFlags,
        colorMode: defaultColorMode,
      };

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: null,
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: error instanceof Error ? error.message : "Failed to save viewer settings.",
      }));
    }
  }

  public async updateActiveTrackerObserverOverride(teamColor: string, enemyColor: string): Promise<void> {
    const snapshot = this.getSnapshot();
    const { profileId, settingsActiveTrackerId } = snapshot;
    if (profileId == null || settingsActiveTrackerId == null) {
      this.updateSnapshot((current) => ({
        ...current,
        viewerSettingsErrorMessage: "No active tracker selected for observer override.",
      }));
      return;
    }

    const nextTeamColor = this.normalizeColorId(teamColor, snapshot.viewerTeamColor);
    const nextEnemyColor = this.normalizeColorId(enemyColor, snapshot.viewerEnemyColor);
    const existingOverrides = this.currentStreamerStyleFlags.observerColorOverrides ?? {};
    const nextOverrides = {
      ...existingOverrides,
      [settingsActiveTrackerId]: {
        teamColor: nextTeamColor,
        enemyColor: nextEnemyColor,
      },
    };

    this.updateSnapshot((current) => ({
      ...current,
      viewerObserverOverrideTeamColor: nextTeamColor,
      viewerObserverOverrideEnemyColor: nextEnemyColor,
      viewerSettingsSaving: true,
      viewerSettingsErrorMessage: null,
    }));

    try {
      await this.config.services.individualTrackerService.updateStreamerViewSettings({
        profileId,
        styleFlags: {
          observerColorOverrides: nextOverrides,
        },
      });

      this.currentStreamerStyleFlags = {
        ...this.currentStreamerStyleFlags,
        observerColorOverrides: nextOverrides,
      };

      this.updateSnapshot((current) => ({
        ...current,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: null,
      }));
    } catch (error) {
      this.updateSnapshot((current) => ({
        ...current,
        viewerSettingsSaving: false,
        viewerSettingsErrorMessage: error instanceof Error ? error.message : "Failed to save viewer settings.",
      }));
    }
  }

  public exitViewerMode(): void {
    this.navigateTo("/");
  }

  public openPublicViewer(xuid: string): void {
    this.navigateTo(buildIndividualTrackerPublicViewPath(xuid));
  }

  public openPublicOverlay(xuid: string): void {
    this.navigateTo(buildIndividualTrackerPublicOverlayPath(xuid));
  }

  public async refreshViewerTracker(): Promise<void> {
    const snapshot = this.getSnapshot();
    if (!snapshot.viewerCanManage || snapshot.viewTrackerId == null) {
      return;
    }

    this.updateSnapshot((current) => ({
      ...current,
      viewerRefreshPending: true,
      viewerRefreshMessage: null,
    }));

    try {
      const response = await this.config.services.individualTrackerService.refreshTracker(snapshot.viewTrackerId);

      if (!response.success) {
        this.updateSnapshot((current) => ({
          ...current,
          viewerRefreshPending: false,
          viewerRefreshMessage: response.message ?? "Refresh is temporarily unavailable.",
        }));
        return;
      }

      this.viewedTracker = response.state;
      this.updateSnapshot((current) => ({
        ...current,
        viewTrackerId: response.state.trackerId,
        viewTrackerGamertag: response.state.gamertag,
        viewerRefreshPending: false,
        viewerRefreshMessage: null,
      }));
      void this.refreshViewerTrackerSummary(response.state.gamertag);
      void this.refreshViewerMatchHistory(response.state.trackerId, response.state.xuid, response.state.matchIds);
    } catch (error) {
      this.updateSnapshot((current) => ({
        ...current,
        viewerRefreshPending: false,
        viewerRefreshMessage: error instanceof Error ? error.message : "Failed to refresh tracker.",
      }));
    }
  }

  public async signIn(): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, errorMessage: null }));

    try {
      const { authUrl } = await this.config.services.authService.startMicrosoftAuth("/individual-tracker");
      this.assignLocation(authUrl);
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to start Microsoft sign-in.",
      }));
    }
  }

  private updateSnapshot(updater: (snapshot: IndividualTrackerSnapshot) => IndividualTrackerSnapshot): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.snapshot = this.deriveSnapshot(updater(this.config.store.snapshot));
    this.notifySubscribers();
  }

  private deriveSnapshot(snapshot: IndividualTrackerSnapshot): IndividualTrackerSnapshot {
    return {
      ...snapshot,
      viewTrackerGamertag: this.viewedTracker?.gamertag ?? snapshot.viewTrackerGamertag,
      viewerCanManage: this.authenticatedUserId != null && this.viewedTracker?.userId === this.authenticatedUserId,
      viewerRefreshInProgress: this.viewedTracker?.refreshInProgress === true,
      viewerRefreshStartedAt: this.viewedTracker?.refreshStartedAt ?? null,
      viewerTrackerSummary: this.viewedTrackerSummary,
      viewerRenderModel: buildIndividualTrackerViewerRenderModel({
        state: this.viewedTracker,
        matchHistory: this.viewedMatchHistory,
        medalMetadata: this.viewedMedalMetadata,
        defaultTeamColor: snapshot.viewerTeamColor,
        defaultEnemyColor: snapshot.viewerEnemyColor,
      }),
    };
  }

  private notifySubscribers(): void {
    for (const subscriber of this.config.store.subscribers) {
      subscriber();
    }
  }

  private navigateTo(url: string): void {
    if (this.config.navigateTo != null) {
      this.config.navigateTo(url);
      return;
    }

    this.assignLocation(url);
  }

  private assignLocation(url: string): void {
    if (this.config.assignLocation != null) {
      this.config.assignLocation(url);
      return;
    }

    window.location.assign(url);
  }

  private normalizeColorId(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,32}$/.test(trimmed)) {
      return fallback;
    }

    return trimmed;
  }

  private getViewerColorsFromStyleFlags(styleFlags: StreamerViewStyleFlags): {
    teamColor: string;
    enemyColor: string;
  } {
    const snapshot = this.getSnapshot();
    return {
      teamColor: this.normalizeColorId(styleFlags.teamColor, snapshot.viewerTeamColor),
      enemyColor: this.normalizeColorId(styleFlags.enemyColor, snapshot.viewerEnemyColor),
    };
  }

  private isSameRoute(left: IndividualTrackerAppRoute, right: IndividualTrackerAppRoute): boolean {
    if (left.kind !== right.kind) {
      return false;
    }

    if (left.kind !== "view-tracker") {
      return true;
    }

    return right.kind === "view-tracker" && left.trackerId === right.trackerId;
  }

  private applyRoute(route: IndividualTrackerAppRoute): void {
    this.viewedTracker = null;
    this.viewedMatchHistory = null;
    this.viewedTrackerSummary = null;
    this.viewedMedalMetadata = {};

    this.updateSnapshot((snapshot) => {
      switch (route.kind) {
        case "manage": {
          return {
            ...snapshot,
            mode: "manage",
            viewSource: null,
            viewTrackerId: null,
            viewTrackerGamertag: null,
            viewConnectionStatus: "idle",
            viewErrorMessage: null,
            viewedMatchHistoryLoading: false,
            viewerRefreshPending: false,
            viewerRefreshMessage: null,
          };
        }
        case "view-active": {
          return {
            ...snapshot,
            mode: "view",
            viewSource: "active",
            viewTrackerId: null,
            viewTrackerGamertag: null,
            viewConnectionStatus: "connecting",
            viewErrorMessage: null,
            viewedMatchHistoryLoading: false,
            viewerRefreshPending: false,
            viewerRefreshMessage: null,
          };
        }
        case "view-tracker": {
          return {
            ...snapshot,
            mode: "view",
            viewSource: "tracker",
            viewTrackerId: route.trackerId,
            viewTrackerGamertag: null,
            viewConnectionStatus: "connecting",
            viewErrorMessage: null,
            viewedMatchHistoryLoading: false,
            viewerRefreshPending: false,
            viewerRefreshMessage: null,
          };
        }
        default: {
          return snapshot;
        }
      }
    });
  }

  private async syncViewerForCurrentRoute(userId: string, xboxXuid: string | null): Promise<void> {
    switch (this.currentRoute.kind) {
      case "manage": {
        this.disposeViewerConnection();
        return;
      }
      case "view-active": {
        if (xboxXuid == null) {
          this.disposeViewerConnection();
          this.updateSnapshot((snapshot) => ({
            ...snapshot,
            viewConnectionStatus: "not_found",
            viewErrorMessage: "No active Xbox identity is linked.",
            viewTrackerId: null,
            viewTrackerGamertag: null,
          }));
          return;
        }

        await this.initializeActiveViewer(xboxXuid);
        return;
      }
      case "view-tracker": {
        await this.initializeViewer(userId, this.currentRoute.trackerId);
        return;
      }
      default: {
        return;
      }
    }
  }

  private disposeViewerConnection(): void {
    this.viewerStateSubscription?.unsubscribe();
    this.viewerStateSubscription = null;
    this.viewerStatusSubscription?.unsubscribe();
    this.viewerStatusSubscription = null;
    this.viewerConnection?.disconnect();
    this.viewerConnection = null;
    this.lastViewerMatchHistoryKey = null;
    this.lastViewerSummaryGamertagKey = null;
    this.viewedTracker = null;
    this.viewedTrackerSummary = null;
    this.viewedMatchHistory = null;
    this.viewedMedalMetadata = {};
  }

  private async refreshViewerTrackerSummary(gamertag: string): Promise<void> {
    const key = gamertag.trim().toLowerCase();
    if (key === "" || key === this.lastViewerSummaryGamertagKey) {
      return;
    }

    this.lastViewerSummaryGamertagKey = key;
    this.viewedTrackerSummary = null;
    this.updateSnapshot((snapshot) => ({ ...snapshot }));

    try {
      const summary = await this.config.services.individualTrackerService.searchGamertag(gamertag);
      this.updateSnapshot((snapshot) => {
        if (this.viewedTracker?.gamertag !== gamertag) {
          return snapshot;
        }

        this.viewedTrackerSummary = summary;
        return { ...snapshot };
      });
    } catch {
      this.updateSnapshot((snapshot) => {
        if (this.viewedTracker?.gamertag !== gamertag) {
          return snapshot;
        }

        this.viewedTrackerSummary = null;
        return { ...snapshot };
      });
    }
  }

  private getViewerMatchHistoryKey(trackerId: string, matchIds: readonly string[]): string {
    return `${trackerId}:${matchIds.join(",")}`;
  }

  private async refreshViewerMatchHistory(trackerId: string, xuid: string, matchIds: readonly string[]): Promise<void> {
    const key = this.getViewerMatchHistoryKey(trackerId, matchIds);
    if (key === this.lastViewerMatchHistoryKey) {
      return;
    }

    this.lastViewerMatchHistoryKey = key;
    this.viewedMatchHistory = null;
    this.viewedMedalMetadata = {};
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewedMatchHistoryLoading: true,
    }));

    try {
      const history = await this.config.services.individualTrackerService.getMatchHistory(xuid, 0, 100);
      const rawMatches = history.matches
        .map((match) => match.rawMatchStats)
        .filter((match): match is NonNullable<typeof match> => match != null);
      const medalMetadata = await this.config.services.individualTrackerService.getMedalMetadata(rawMatches);

      this.updateSnapshot((snapshot) => {
        if (this.viewedTracker?.trackerId !== trackerId) {
          return snapshot;
        }

        this.viewedMatchHistory = history;
        this.viewedMedalMetadata = medalMetadata;

        return {
          ...snapshot,
          viewedMatchHistoryLoading: false,
        };
      });
    } catch (error) {
      this.viewedMatchHistory = null;
      this.viewedMedalMetadata = {};
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewedMatchHistoryLoading: false,
        viewErrorMessage: error instanceof Error ? error.message : "Failed to load tracker matches.",
      }));
    }
  }

  private setViewStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewConnectionStatus: status,
      viewErrorMessage:
        status === "error"
          ? (detail ?? "Tracker connection failed.")
          : status === "not_found"
            ? snapshot.viewSource === "active"
              ? "No active tracker is currently selected."
              : "Tracker not found or not currently available."
            : status === "connected"
              ? null
              : snapshot.viewErrorMessage,
    }));
  }

  private async initializeViewer(userId: string, trackerId: string): Promise<void> {
    this.disposeViewerConnection();

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewConnectionStatus: "connecting",
      viewErrorMessage: null,
      viewedMatchHistoryLoading: false,
    }));

    try {
      const statusResponse = await this.config.services.individualTrackerService.getTrackerState(userId, trackerId);
      if (statusResponse.activeTracker == null) {
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          viewConnectionStatus: "not_found",
          viewErrorMessage: "Tracker not found or not currently available.",
        }));
        return;
      }

      const { activeTracker } = statusResponse;
      this.viewedTracker = activeTracker;
      this.viewedMatchHistory = null;
      this.viewedMedalMetadata = {};

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewTrackerId: activeTracker.trackerId,
        viewTrackerGamertag: activeTracker.gamertag,
        viewedMatchHistoryLoading: false,
      }));

      void this.refreshViewerTrackerSummary(activeTracker.gamertag);
      void this.refreshViewerMatchHistory(activeTracker.trackerId, activeTracker.xuid, activeTracker.matchIds);

      const connection = this.config.services.individualTrackerService.connectToTracker(userId, trackerId);
      this.viewerConnection = connection;

      this.viewerStateSubscription = connection.subscribe((state) => {
        this.viewedTracker = state;
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          viewTrackerId: state.trackerId,
          viewTrackerGamertag: state.gamertag,
        }));
        void this.refreshViewerTrackerSummary(state.gamertag);
        void this.refreshViewerMatchHistory(state.trackerId, state.xuid, state.matchIds);
      });

      this.viewerStatusSubscription = connection.subscribeStatus((status, detail) => {
        this.setViewStatus(status, detail);
      });
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewConnectionStatus: "error",
        viewErrorMessage: error instanceof Error ? error.message : "Failed to load tracker view.",
      }));
    }
  }

  private async initializeActiveViewer(xuid: string): Promise<void> {
    this.disposeViewerConnection();

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewConnectionStatus: "connecting",
      viewErrorMessage: null,
      viewTrackerId: null,
      viewTrackerGamertag: null,
    }));

    try {
      const statusResponse = await this.config.services.individualTrackerService.getActiveTrackerState(xuid);
      this.viewedTracker = statusResponse.activeTracker;
      this.viewedMatchHistory = null;
      this.viewedMedalMetadata = {};
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewTrackerId: statusResponse.activeTracker?.trackerId ?? null,
        viewTrackerGamertag: statusResponse.activeTracker?.gamertag ?? null,
        viewConnectionStatus: statusResponse.activeTracker == null ? "not_found" : snapshot.viewConnectionStatus,
        viewErrorMessage:
          statusResponse.activeTracker == null ? "No active tracker is currently selected." : snapshot.viewErrorMessage,
        viewedMatchHistoryLoading: false,
      }));

      if (statusResponse.activeTracker != null) {
        void this.refreshViewerTrackerSummary(statusResponse.activeTracker.gamertag);
        void this.refreshViewerMatchHistory(
          statusResponse.activeTracker.trackerId,
          statusResponse.activeTracker.xuid,
          statusResponse.activeTracker.matchIds,
        );
      }

      const connection = this.config.services.individualTrackerService.connectToActiveTracker(xuid);
      this.viewerConnection = connection;

      this.viewerStateSubscription = connection.subscribe((state) => {
        this.viewedTracker = state;
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          viewTrackerId: state.trackerId,
          viewTrackerGamertag: state.gamertag,
        }));
        void this.refreshViewerTrackerSummary(state.gamertag);
        void this.refreshViewerMatchHistory(state.trackerId, state.xuid, state.matchIds);
      });

      this.viewerStatusSubscription = connection.subscribeStatus((status, detail) => {
        this.setViewStatus(status, detail);
      });
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewConnectionStatus: "error",
        viewErrorMessage: error instanceof Error ? error.message : "Failed to load active tracker view.",
      }));
    }
  }

  private async refresh(): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, loading: true, errorMessage: null }));

    try {
      const session = await this.config.services.authService.getSession();
      const userId = session.userId ?? null;
      const xboxXuid = session.xboxXuid ?? null;

      if (!session.authenticated || userId == null) {
        this.disposeViewerConnection();
        this.config.liveTrackersController.resetForUnauthenticated();
        this.authenticatedUserId = null;
        this.authenticatedXboxXuid = null;
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          authState: "unauthenticated",
          profileId: null,
          xboxXuid: null,
          settingsActiveTrackerId: null,
          settingsActiveTrackerGamertag: null,
          viewedMatchHistoryLoading: false,
          viewerRefreshPending: false,
          viewerRefreshMessage: null,
        }));
        return;
      }

      this.authenticatedUserId = userId;
      this.authenticatedXboxXuid = xboxXuid;

      const profileResponse = await this.config.services.individualTrackerService.getProfile();
      const profileId = profileResponse.profile?.ProfileId ?? null;

      if (profileId != null) {
        try {
          const streamerSettings =
            await this.config.services.individualTrackerService.getStreamerViewSettings(profileId);
          const activeTrackerResponse =
            xboxXuid == null
              ? { activeTracker: null }
              : await this.config.services.individualTrackerService.getActiveTrackerState(xboxXuid);
          this.currentStreamerStyleFlags = streamerSettings.styleFlags;
          const viewerColors = this.getViewerColorsFromStyleFlags(streamerSettings.styleFlags);
          const activeTrackerId = activeTrackerResponse.activeTracker?.trackerId ?? null;
          const activeTrackerGamertag = activeTrackerResponse.activeTracker?.gamertag ?? null;
          const activeObserverOverride =
            activeTrackerId == null
              ? null
              : streamerSettings.styleFlags.observerColorOverrides?.[activeTrackerId] ?? null;

          this.updateSnapshot((snapshot) => ({
            ...snapshot,
            profileId,
            xboxXuid,
            settingsActiveTrackerId: activeTrackerId,
            settingsActiveTrackerGamertag: activeTrackerGamertag,
            viewerTeamColor: viewerColors.teamColor,
            viewerEnemyColor: viewerColors.enemyColor,
            viewerDefaultColorMode: streamerSettings.layoutOptions.defaultColorMode ?? "observer",
            viewerShowTabs: streamerSettings.visibleSections.showTabs ?? true,
            viewerShowTicker: streamerSettings.visibleSections.showTicker ?? true,
            viewerShowTeamDetails: streamerSettings.visibleSections.showTeamDetails ?? true,
            viewerObserverOverrideTeamColor: activeObserverOverride?.teamColor ?? null,
            viewerObserverOverrideEnemyColor: activeObserverOverride?.enemyColor ?? null,
          }));
        } catch {
          this.currentStreamerStyleFlags = {};
          this.updateSnapshot((snapshot) => ({
            ...snapshot,
            profileId,
            xboxXuid,
            settingsActiveTrackerId: null,
            settingsActiveTrackerGamertag: null,
          }));
        }
      } else {
        this.currentStreamerStyleFlags = {};
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          profileId: null,
          xboxXuid,
          settingsActiveTrackerId: null,
          settingsActiveTrackerGamertag: null,
        }));
      }

      this.config.liveTrackersController.setSessionContext(userId, session.xboxGamertag ?? null, xboxXuid);
      await this.config.liveTrackersController.refresh();

      await this.syncViewerForCurrentRoute(userId, xboxXuid);

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        authState: "authenticated",
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to load individual tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, loading: false }));
    }
  }
}
