import type { Services } from "../../services/types";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualTrackerSubscription,
  TrackerMatchHistoryResponse,
} from "../../services/individual-tracker/types";
import type { IndividualTrackerSectionId, IndividualTrackerSnapshot } from "./types";
import type { IndividualTrackerStore } from "./individual-tracker-store";
import type { LiveTrackersController } from "./live-trackers/types";
import { buildIndividualTrackerViewerRenderModel } from "./viewer/viewer-render-model";

interface Config {
  readonly services: Services;
  readonly store: IndividualTrackerStore;
  readonly liveTrackersController: LiveTrackersController;
  readonly assignLocation?: (url: string) => void;
}

export class IndividualTrackerPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private viewerConnection: IndividualTrackerConnection | null = null;
  private viewerStateSubscription: IndividualTrackerSubscription | null = null;
  private viewerStatusSubscription: IndividualTrackerSubscription | null = null;
  private lastViewerMatchHistoryKey: string | null = null;
  private viewedTracker: IndividualTrackerState | null = null;
  private viewedMatchHistory: TrackerMatchHistoryResponse | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    this.config.liveTrackersController.start();
    this.initializeModeFromUrl();
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

  public exitViewerMode(): void {
    this.assignLocation("/individual-tracker");
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
      viewerRenderModel: buildIndividualTrackerViewerRenderModel({
        state: this.viewedTracker,
        matchHistory: this.viewedMatchHistory,
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

  private getViewerColorsFromStyleFlags(styleFlags: Readonly<Record<string, unknown>>): {
    teamColor: string;
    enemyColor: string;
  } {
    const snapshot = this.getSnapshot();
    return {
      teamColor: this.normalizeColorId(styleFlags.teamColor, snapshot.viewerTeamColor),
      enemyColor: this.normalizeColorId(styleFlags.enemyColor, snapshot.viewerEnemyColor),
    };
  }

  private initializeModeFromUrl(): void {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "active") {
      this.viewedTracker = null;
      this.viewedMatchHistory = null;
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        mode: "view",
        viewSource: "active",
        viewTrackerId: null,
        viewConnectionStatus: "connecting",
        viewErrorMessage: null,
        viewedMatchHistoryLoading: false,
      }));
      return;
    }

    const trackerId = params.get("tracker");
    if (trackerId == null || trackerId.trim() === "") {
      return;
    }

    this.viewedTracker = null;
    this.viewedMatchHistory = null;
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      mode: "view",
      viewSource: "tracker",
      viewTrackerId: trackerId,
      viewConnectionStatus: "connecting",
      viewErrorMessage: null,
      viewedMatchHistoryLoading: false,
    }));
  }

  private disposeViewerConnection(): void {
    this.viewerStateSubscription?.unsubscribe();
    this.viewerStateSubscription = null;
    this.viewerStatusSubscription?.unsubscribe();
    this.viewerStatusSubscription = null;
    this.viewerConnection?.disconnect();
    this.viewerConnection = null;
    this.lastViewerMatchHistoryKey = null;
    this.viewedTracker = null;
    this.viewedMatchHistory = null;
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
    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewedMatchHistoryLoading: true,
    }));

    try {
      const history = await this.config.services.individualTrackerService.getMatchHistory(xuid, 0, 100);

      this.updateSnapshot((snapshot) => {
        if (this.viewedTracker?.trackerId !== trackerId) {
          return snapshot;
        }

        this.viewedMatchHistory = history;

        return {
          ...snapshot,
          viewedMatchHistoryLoading: false,
        };
      });
    } catch (error) {
      this.viewedMatchHistory = null;
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

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewTrackerId: activeTracker.trackerId,
        viewedMatchHistoryLoading: false,
      }));

      void this.refreshViewerMatchHistory(activeTracker.trackerId, activeTracker.xuid, activeTracker.matchIds);

      const connection = this.config.services.individualTrackerService.connectToTracker(userId, trackerId);
      this.viewerConnection = connection;

      this.viewerStateSubscription = connection.subscribe((state) => {
        this.viewedTracker = state;
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          viewTrackerId: state.trackerId,
        }));
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

  private async initializeActiveViewer(userId: string): Promise<void> {
    this.disposeViewerConnection();

    this.updateSnapshot((snapshot) => ({
      ...snapshot,
      viewConnectionStatus: "connecting",
      viewErrorMessage: null,
      viewTrackerId: null,
    }));

    try {
      const statusResponse = await this.config.services.individualTrackerService.getActiveTrackerState(userId);
      this.viewedTracker = statusResponse.activeTracker;
      this.viewedMatchHistory = null;
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        viewTrackerId: statusResponse.activeTracker?.trackerId ?? null,
        viewConnectionStatus: statusResponse.activeTracker == null ? "not_found" : snapshot.viewConnectionStatus,
        viewErrorMessage:
          statusResponse.activeTracker == null ? "No active tracker is currently selected." : snapshot.viewErrorMessage,
        viewedMatchHistoryLoading: false,
      }));

      if (statusResponse.activeTracker != null) {
        void this.refreshViewerMatchHistory(
          statusResponse.activeTracker.trackerId,
          statusResponse.activeTracker.xuid,
          statusResponse.activeTracker.matchIds,
        );
      }

      const connection = this.config.services.individualTrackerService.connectToActiveTracker(userId);
      this.viewerConnection = connection;

      this.viewerStateSubscription = connection.subscribe((state) => {
        this.viewedTracker = state;
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          viewTrackerId: state.trackerId,
        }));
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

      if (!session.authenticated || userId == null) {
        this.disposeViewerConnection();
        this.config.liveTrackersController.resetForUnauthenticated();
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          authState: "unauthenticated",
          profileId: null,
          viewedMatchHistoryLoading: false,
        }));
        return;
      }

      const profileResponse = await this.config.services.individualTrackerService.getProfile();
      const profileId = profileResponse.profile?.ProfileId ?? null;

      if (profileId != null) {
        try {
          const streamerSettings =
            await this.config.services.individualTrackerService.getStreamerViewSettings(profileId);
          const viewerColors = this.getViewerColorsFromStyleFlags(streamerSettings.styleFlags);

          this.updateSnapshot((snapshot) => ({
            ...snapshot,
            profileId,
            viewerTeamColor: viewerColors.teamColor,
            viewerEnemyColor: viewerColors.enemyColor,
          }));
        } catch {
          this.updateSnapshot((snapshot) => ({
            ...snapshot,
            profileId,
          }));
        }
      } else {
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          profileId: null,
        }));
      }

      this.config.liveTrackersController.setSessionContext(userId, session.xboxGamertag ?? null);
      await this.config.liveTrackersController.refresh();

      const { viewSource, viewTrackerId } = this.getSnapshot();
      if (viewSource === "tracker" && viewTrackerId != null) {
        await this.initializeViewer(userId, viewTrackerId);
      } else if (viewSource === "active") {
        await this.initializeActiveViewer(userId);
      } else {
        this.disposeViewerConnection();
      }

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
