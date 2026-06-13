import type { HaloInfiniteClient } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewSubscription,
} from "../../../services/individual-tracker/view-types";
import { buildViewerRenderModel } from "./viewer-render-model";
import type { IndividualTrackerViewerSnapshot, IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel } from "./types";

interface Config {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly haloClient: HaloInfiniteClient;
  readonly store: IndividualTrackerViewerStore;
  readonly trackerId: string;
}

export class IndividualTrackerViewerPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private connection: TrackerViewConnection | null = null;
  private viewSubscription: TrackerViewSubscription | null = null;
  private statusSubscription: TrackerViewSubscription | null = null;
  private selectedMatchId: string | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: IndividualTrackerViewerSnapshot): IndividualTrackerViewerViewModel {
    const streamerSettings = snapshot.view?.streamerSettings;
    const styleFlags = streamerSettings?.styleFlags;
    return {
      renderModel:
        snapshot.view == null
          ? null
          : buildViewerRenderModel({
              view: snapshot.view,
              preferredTeamColorId: styleFlags?.playerTeamColor ?? styleFlags?.teamColor,
              preferredEnemyColorId: styleFlags?.playerEnemyColor ?? styleFlags?.enemyColor,
            }),
      connectionStatus: snapshot.connectionStatus,
      selectedMatchId: snapshot.selectedMatchId,
      matchStatsState: snapshot.matchStatsState,
      streamerSettings,
    };
  }

  public selectMatch(matchId: string): void {
    if (this.selectedMatchId === matchId) {
      return;
    }
    this.selectedMatchId = matchId;
    this.config.store.setSelectedMatchId(matchId);
    void this.fetchMatchStats(matchId);
  }

  public deselectMatch(): void {
    this.selectedMatchId = null;
    this.config.store.setSelectedMatchId(null);
  }

  private isStale(matchId: string): boolean {
    return this.isDisposed || this.selectedMatchId !== matchId;
  }

  private async fetchMatchStats(matchId: string): Promise<void> {
    try {
      const [stats, analytics] = await Promise.all([
        this.config.haloClient.getMatchStats(matchId),
        this.config.matchAnalyticsService.getMatchAnalytics(matchId).catch(() => null),
      ]);
      if (this.isStale(matchId)) {
        return;
      }
      const xuids = stats.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p));
      const [users, medalsMetadataFile] = await Promise.all([
        this.config.haloClient.getUsers(xuids),
        this.config.haloClient.getMedalsMetadataFile(),
      ]);
      if (this.isStale(matchId)) {
        return;
      }
      const playerMap = new Map(users.map((u) => [u.xuid, u.gamertag]));
      for (const xuid of xuids) {
        if (!playerMap.has(xuid)) {
          playerMap.set(xuid, xuid);
        }
      }
      const medalMetadata: MedalMetadata = Object.fromEntries(
        medalsMetadataFile.medals.map((m) => [m.nameId, { name: m.name.value, sortingWeight: m.sortingWeight }]),
      );
      this.config.store.setMatchStats(matchId, stats, playerMap, medalMetadata, analytics);
    } catch (error) {
      if (this.isStale(matchId)) {
        return;
      }
      this.config.store.setMatchStatsError(matchId, error instanceof Error ? error.message : "Failed to load stats");
    }
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  private async load(): Promise<void> {
    this.config.store.setLoading();
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
      this.config.store.setLoaded(response.view);
      this.openConnection();
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
    }
  }

  private openConnection(): void {
    this.viewSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.connection?.disconnect();

    const connection = this.config.individualTrackerViewService.connect(this.config.trackerId);
    this.connection = connection;
    this.viewSubscription = connection.subscribe((view) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setView(view);
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setConnectionStatus(status);
    });
  }
}
