import { compareDesc } from "date-fns";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  getStreamerViewTeamColorIds,
  withStreamerViewSettingsDefaults,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { resolveSeriesTeamMapping } from "@guilty-spark/shared/halo/series-team-identity";
import type { MatchTeamRoster, SeriesTeamRoster } from "@guilty-spark/shared/halo/series-team-identity";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewSubscription,
} from "../../../services/individual-tracker/view-types";
import { getReconnectDelayMs } from "../../../services/base/reconnect-policy";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { SeriesOverviewProps } from "../../series-overview/types";
import type { EntryDetailController } from "../../../controllers/entry-detail/entry-detail-controller";
import { buildViewerRenderModel } from "./viewer-render-model";
import type { IndividualTrackerViewerSnapshot, IndividualTrackerViewerStore } from "./viewer-store";
import type {
  IndividualTrackerViewerRenderModel,
  IndividualTrackerViewerViewModel,
  ViewerEntryState,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "./types";

interface Config {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly entryDetailController: EntryDetailController;
  readonly store: IndividualTrackerViewerStore;
  readonly trackerId: string;
}

export class IndividualTrackerViewerPresenter {
  private readonly config: Config;
  private readonly entryDetailController: EntryDetailController;
  private isDisposed = false;
  private connection: TrackerViewConnection | null = null;
  private viewSubscription: TrackerViewSubscription | null = null;
  private statusSubscription: TrackerViewSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private awaitingRefresh = false;
  private streamerSettings: StreamerViewSettings | undefined;
  private streamerSettingsKey = "null";
  private hasServerStreamerSettings = false;
  private modeVersion = 0;

  public constructor(config: Config) {
    this.config = config;
    this.entryDetailController = config.entryDetailController;
  }

  public static present(snapshot: IndividualTrackerViewerSnapshot): IndividualTrackerViewerViewModel {
    const streamerSettings = withStreamerViewSettingsDefaults(snapshot.view?.streamerSettings);
    const { teamColorId, enemyColorId } = getStreamerViewTeamColorIds(streamerSettings);
    const baseRenderModel =
      snapshot.view == null
        ? null
        : buildViewerRenderModel({
            view: snapshot.view,
            preferredTeamColorId: teamColorId,
            preferredEnemyColorId: enemyColorId,
          });
    return {
      renderModel:
        baseRenderModel == null
          ? null
          : IndividualTrackerViewerPresenter.applyLoadedSeriesDetails(baseRenderModel, snapshot.entryStates),
      connectionStatus: snapshot.connectionStatus,
      refreshPending: snapshot.refreshPending,
      expandedEntryKeys: snapshot.expandedEntryKeys,
      entryStates: snapshot.entryStates,
      streamerSettings,
    };
  }

  private static applyLoadedSeriesDetails(
    renderModel: IndividualTrackerViewerRenderModel,
    entryStates: ReadonlyMap<string, ViewerEntryState>,
  ): IndividualTrackerViewerRenderModel {
    const timeline = renderModel.timeline.map((item) => {
      if (item.type !== "series") {
        return item;
      }

      const entryState = entryStates.get(`series:${item.series.id}`);
      if (entryState?.kind !== "series" || entryState.state.status !== "loaded") {
        return item;
      }

      return {
        ...item,
        series: {
          ...item.series,
          seriesOverview: this.presentViewerSeriesOverview(item.series, entryState.state.data, renderModel.teamColors),
        },
      };
    });

    return { ...renderModel, timeline };
  }

  private static presentViewerSeriesOverview(
    series: ViewerSeriesTab,
    data: SeriesDetailResponse,
    colors: readonly TeamColor[],
  ): ViewerSeriesTab["seriesOverview"] {
    const resultsById = new Map(data.matches.results.map((result) => [result.matchId, result]));
    const details = data.matches.results.flatMap((result) => (result.status === "resolved" ? [result.detail] : []));
    const anchor = details.find((detail) => detail.matchId === series.matches[0]?.matchId);
    const loadedTeams = this.presentTeams(details, colors);
    return {
      ...series.seriesOverview,
      teams: series.teams.length === 0 && loadedTeams.length > 0 ? loadedTeams : series.seriesOverview.teams,
      matches: series.seriesOverview.matches.map((match) => {
        const result = resultsById.get(match.id);
        if (result == null) {
          return match;
        }
        if (result.status === "unavailable") {
          return { ...match, score: "Unavailable", subScore: null };
        }
        const { detail } = result;
        const orderedIds = this.presentScoreTeamIds(series, detail, anchor);
        return {
          ...match,
          mapBackgroundUrl:
            detail.map.thumbnailUrl == null || detail.map.thumbnailUrl === "data:,"
              ? match.mapBackgroundUrl
              : detail.map.thumbnailUrl,
          score: this.presentScore(detail.score.primary, orderedIds) ?? "Unavailable",
          subScore: this.presentScore(detail.score.secondary, orderedIds),
        };
      }),
    };
  }

  private static presentRosters(detail: MatchDetail | undefined): MatchTeamRoster[] {
    const rosters = new Map<number, Set<string>>();
    for (const player of detail?.players ?? []) {
      if (!player.participation.presentAtBeginning || player.lastMatchTeamId == null) {
        continue;
      }
      const roster = rosters.get(player.lastMatchTeamId) ?? new Set<string>();
      roster.add(unwrapXuid(player.playerId));
      rosters.set(player.lastMatchTeamId, roster);
    }
    return [...rosters].sort(([left], [right]) => left - right).map(([matchTeamId, xuids]) => ({ matchTeamId, xuids }));
  }

  private static presentBackendTeamOrder(detail: MatchDetail): number[] | null {
    const teams = [...detail.teams].sort((left, right) => {
      if (left.seriesTeamId == null || right.seriesTeamId == null) {
        return 0;
      }
      return left.seriesTeamId - right.seriesTeamId;
    });
    if (
      teams.length !== 2 ||
      teams.some((team) => team.seriesTeamId == null) ||
      new Set(teams.map((team) => team.seriesTeamId)).size !== teams.length ||
      new Set(teams.map((team) => team.matchTeamId)).size !== teams.length
    ) {
      return null;
    }
    return teams.map((team) => team.matchTeamId);
  }

  private static presentScoreTeamIds(
    series: ViewerSeriesTab,
    detail: MatchDetail,
    anchor: MatchDetail | undefined,
  ): number[] {
    const anchorRosters = this.presentRosters(anchor);
    const matchRosters = this.presentRosters(detail);
    const canonical = resolveSeriesTeamMapping(
      anchorRosters.map((roster) => ({ seriesTeamId: roster.matchTeamId, xuids: roster.xuids })),
      matchRosters,
    );
    const orderedIds = canonical?.map((entry) => entry.matchTeamId) ?? detail.teams.map((team) => team.matchTeamId);
    if (series.teams.length === 0) {
      return this.presentBackendTeamOrder(detail) ?? orderedIds;
    }
    if (anchor == null || series.teams.length !== 2 || detail.teams.length !== 2) {
      return orderedIds;
    }
    const configured: SeriesTeamRoster[] = series.teams.map((team) => {
      const xuids = new Set(
        team.players.flatMap((player) => (player.xboxId == null ? [] : [unwrapXuid(player.xboxId)])),
      );
      return { seriesTeamId: team.id, xuids, unidentifiedPlayerCount: team.players.length - xuids.size };
    });
    if (configured.some((roster) => roster.xuids.size === 0)) {
      return orderedIds;
    }
    const resolution = resolveSeriesTeamMapping(configured, matchRosters);
    const firstTeam = resolution?.find((entry) => entry.seriesTeamId === series.teams[0]?.id);
    return firstTeam?.matchTeamId === orderedIds[1] ? [...orderedIds].reverse() : orderedIds;
  }

  private static presentScore(section: MatchDetail["score"]["primary"], teamIds: readonly number[]): string | null {
    if (section == null || section.teams.length === 0) {
      return null;
    }
    const scores = new Map(section.teams.map((team) => [team.matchTeamId, team.value]));
    return teamIds
      .flatMap((id) => {
        const score = scores.get(id);
        return score == null ? [] : [score.toLocaleString("en-US")];
      })
      .join(":");
  }

  private static presentTeams(
    details: readonly MatchDetail[],
    colors: readonly TeamColor[],
  ): SeriesOverviewProps["teams"] {
    const latest = [...details].sort((left, right) => compareDesc(left.endTime, right.endTime)).at(0);
    return [...(latest?.teams ?? [])]
      .sort((left, right) => (left.seriesTeamId ?? left.matchTeamId) - (right.seriesTeamId ?? right.matchTeamId))
      .map((team, index) => ({
        id: `loaded:${team.matchTeamId.toString()}`,
        name: team.name ?? getTeamName(team.matchTeamId),
        teamColorHex: getTeamColorOrDefault(colors[index]?.id, index).hex,
        players: (latest?.players ?? [])
          .filter(
            (player) =>
              player.playerType === 1 &&
              player.participation.presentAtBeginning &&
              player.teamStats.some((stats) => stats.matchTeamId === team.matchTeamId),
          )
          .map((player) => ({
            id: player.playerId,
            discordName: player.gamertag ?? "*Unknown*",
            gamertag: player.gamertag,
          })),
      }));
  }

  public refresh(): void {
    // Refresh is only available in managed context.
    if (this.config.individualTrackerService == null) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.refreshPending || snapshot.view?.status !== "active") {
      return;
    }

    this.awaitingRefresh = true;
    this.config.store.setRefreshState(true);
    void this.refreshAsync();
  }

  public setStreamerSettings(streamerSettings: StreamerViewSettings | undefined): void {
    const nextKey = JSON.stringify(streamerSettings ?? null);
    if (nextKey === this.streamerSettingsKey) {
      return;
    }

    this.streamerSettings = streamerSettings;
    this.streamerSettingsKey = nextKey;

    if (this.hasServerStreamerSettings) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.view == null) {
      return;
    }

    this.config.store.setLoaded({ ...snapshot.view, streamerSettings: this.streamerSettings });
  }

  public setExternalView(view: TrackerViewState): void {
    this.modeVersion += 1;
    this.closeConnection();
    this.awaitingRefresh = false;
    this.config.store.setRefreshState(false);
    this.hasServerStreamerSettings = view.streamerSettings !== undefined;
    const resolvedView =
      view.streamerSettings === undefined && this.streamerSettings !== undefined
        ? { ...view, streamerSettings: this.streamerSettings }
        : view;
    this.config.store.setLoaded(resolvedView);
    this.config.store.setConnectionStatus("connected");
  }

  public toggleEntry(item: ViewerTimelineItem): void {
    this.entryDetailController.toggleEntry(item);
  }

  public loadAnalytics(item: ViewerTimelineItem, module: AnalyticsModule, matchId?: string): void {
    this.entryDetailController.loadAnalytics(item, module, matchId);
  }

  public start(): void {
    this.resetReconnectState();
    this.modeVersion += 1;
    const { modeVersion } = this;
    void this.load(modeVersion);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.entryDetailController.dispose();
    this.resetReconnectState();
    this.awaitingRefresh = false;
    this.closeConnection();
  }

  private resetReconnectState(): void {
    this.reconnectAttempt = 0;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null || this.isDisposed) {
      return;
    }

    const delay = getReconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.isDisposed) {
        return;
      }

      this.openConnection();
    }, delay);
  }

  private async refreshAsync(): Promise<void> {
    try {
      // Only refresh in managed context when individual tracker service is available.
      if (this.config.individualTrackerService == null) {
        return;
      }
      await this.config.individualTrackerService.refreshTracker(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.awaitingRefresh = false;
      this.config.store.setRefreshState(false);
    }
  }

  private async load(modeVersion: number): Promise<void> {
    this.config.store.setLoading();
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed || this.modeVersion !== modeVersion) {
        return;
      }
      this.hasServerStreamerSettings = response.view.streamerSettings !== undefined;
      const view =
        response.view.streamerSettings === undefined && this.streamerSettings !== undefined
          ? { ...response.view, streamerSettings: this.streamerSettings }
          : response.view;
      this.config.store.setLoaded(view);
      this.openConnection();
    } catch (error) {
      if (this.isDisposed || this.modeVersion !== modeVersion) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
    }
  }

  private openConnection(): void {
    this.closeConnection();

    const connection = this.config.individualTrackerViewService.connect(this.config.trackerId);
    this.connection = connection;
    this.viewSubscription = connection.subscribe((view) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setView(view);
      if (this.awaitingRefresh) {
        this.awaitingRefresh = false;
        this.config.store.setRefreshState(false);
      }
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }

      this.config.store.setConnectionStatus(status);

      if (status === "connected") {
        this.resetReconnectState();
        return;
      }

      if (status === "error" || status === "disconnected") {
        this.scheduleReconnect();
      }
    });
  }

  private closeConnection(): void {
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }
}
