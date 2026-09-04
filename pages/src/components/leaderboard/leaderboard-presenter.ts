import {
  getLeaderboardMetricAggregation,
  getLeaderboardMetricFamiliesForAggregation,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  getLeaderboardMetricAggregationLabel,
  resolveLeaderboardMetric,
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardService } from "../../services/leaderboard/leaderboard-types";
import type { LeaderboardSnapshot, LeaderboardStore } from "./leaderboard-store";
import type { LeaderboardOptionGroup, LeaderboardTableRow, LeaderboardViewModel } from "./types";

interface LeaderboardPresenterOptions {
  readonly store: LeaderboardStore;
  readonly service: LeaderboardService;
  readonly guildId: string;
  readonly initialQueueChannelId: string | null;
}

function findWindow(value: string | null): LeaderboardWindow | undefined {
  return Object.values(LeaderboardWindow).find((window) => window.toLowerCase() === value?.toLowerCase());
}

function findMetric(value: string | null): LeaderboardMetric | undefined {
  return Object.values(LeaderboardMetric).find((metric) => metric.toLowerCase() === value?.toLowerCase());
}

function getMetricValue(value: number, metric: LeaderboardMetric): string {
  if (metric === LeaderboardMetric.SeriesWinRate || metric === LeaderboardMetric.GamesWinRate) {
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }
  if (metric === LeaderboardMetric.ObjectiveTeamContribution) {
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }
  if (metric === LeaderboardMetric.ObjectiveTime || metric === LeaderboardMetric.AvgObjectiveTimePerGame) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}s`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getScopeLabel(queueChannelId: string | null, queueOptions: LeaderboardSnapshot["queueOptions"]): string {
  if (queueChannelId == null) {
    return "All configured queues";
  }
  return queueOptions.find((option) => option.channelId === queueChannelId)?.label ?? `Queue ${queueChannelId}`;
}

function getWindowLabel(window: LeaderboardWindow): string {
  return window === LeaderboardWindow.LastReset ? "Since last reset" : window;
}

export class LeaderboardPresenter {
  private readonly store: LeaderboardStore;
  private readonly service: LeaderboardService;
  private readonly guildId: string;
  private currentQueueChannelId: string | null;
  private currentWindow: LeaderboardWindow | undefined;
  private currentMetric: LeaderboardMetric | undefined;
  private isDisposed = false;
  private requestNumber = 0;

  constructor({ store, service, guildId, initialQueueChannelId }: LeaderboardPresenterOptions) {
    this.store = store;
    this.service = service;
    this.guildId = guildId;
    this.currentQueueChannelId = initialQueueChannelId;
    this.currentWindow = findWindow(new URLSearchParams(window.location.search).get("window"));
    this.currentMetric = findMetric(new URLSearchParams(window.location.search).get("metric"));
  }

  start(): void {
    this.load();
  }

  load(): void {
    this.requestNumber += 1;
    this.store.setLoading();
    void this.loadAsync(this.requestNumber);
  }

  private async loadAsync(activeRequest: number): Promise<void> {
    try {
      const [response, queueOptions] = await Promise.all([
        this.service.getLeaderboard({
          guildId: this.guildId,
          queueChannelId: this.currentQueueChannelId,
          window: this.currentWindow,
          metric: this.currentMetric,
        }),
        this.service.getQueueOptions(this.guildId),
      ]);
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.currentWindow = response.window;
      this.currentMetric = response.metric;
      this.store.setLoaded(response, queueOptions);
    } catch {
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.store.setError("Unable to load leaderboard data.");
    }
  }

  changeQueue(value: string): void {
    this.currentQueueChannelId = value === "all" ? null : value;
    this.updateUrl();
    this.load();
  }

  changeWindow(value: string): void {
    this.currentWindow = findWindow(value);
    this.updateUrl();
    this.load();
  }

  changeMetric(value: string): void {
    const metric = findMetric(value);
    if (metric == null) {
      return;
    }
    this.currentMetric = metric;
    this.updateUrl();
    this.load();
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
  }

  present(snapshot: LeaderboardSnapshot): LeaderboardViewModel {
    const { response } = snapshot;
    const metric = this.currentMetric ?? response?.metric ?? LeaderboardMetric.Kills;
    const aggregation = getLeaderboardMetricAggregation(metric);
    const family = getLeaderboardMetricFamily(metric);
    const metricGroups: readonly LeaderboardOptionGroup[] = Object.values(LeaderboardMetricAggregation).map(
      (candidateAggregation) => ({
        label: getLeaderboardMetricAggregationLabel(candidateAggregation),
        options: getLeaderboardMetricFamiliesForAggregation(candidateAggregation).map((candidateFamily) => ({
          value: resolveLeaderboardMetric(candidateFamily, candidateAggregation),
          label: getLeaderboardMetricFamilyLabel(candidateFamily),
        })),
      }),
    );
    const tableRows: readonly LeaderboardTableRow[] =
      response?.rows.map((row) => ({
        rank: row.rank,
        gamertag: row.gamertag,
        xboxXuid: row.xboxXuid,
        value: getMetricValue(row.metricValue, metric),
        gamesPlayed: row.gamesPlayed,
      })) ?? [];

    const windowOptions = [
      { value: LeaderboardWindow.OneWeek, label: "1 week" },
      { value: LeaderboardWindow.OneMonth, label: "1 month" },
      { value: LeaderboardWindow.ThreeMonths, label: "3 months" },
      { value: LeaderboardWindow.SixMonths, label: "6 months" },
      { value: LeaderboardWindow.TwelveMonths, label: "12 months" },
      ...(response?.resetAt == null ? [] : [{ value: LeaderboardWindow.LastReset, label: "Since last reset" }]),
    ];

    return {
      state: snapshot.status,
      errorMessage: snapshot.errorMessage,
      title: "Leaderboard",
      scopeLabel: `${snapshot.guildName || this.guildId} / ${getScopeLabel(this.currentQueueChannelId, snapshot.queueOptions)}`,
      windowLabel: getWindowLabel(this.currentWindow ?? response?.window ?? LeaderboardWindow.ThreeMonths),
      metricLabel: `${getLeaderboardMetricFamilyLabel(family)} (${getLeaderboardMetricAggregationLabel(aggregation).toLowerCase()})`,
      rows: tableRows,
      queueOptions: [
        { value: "all", label: "All configured queues" },
        ...snapshot.queueOptions.map((option) => ({ value: option.channelId, label: option.label })),
      ],
      windowOptions,
      metricGroups,
      selectedQueueChannelId: this.currentQueueChannelId,
      selectedWindow: this.currentWindow ?? response?.window ?? LeaderboardWindow.ThreeMonths,
      selectedMetric: metric,
      onQueueChange: (value): void => {
        this.changeQueue(value);
      },
      onWindowChange: (value): void => {
        this.changeWindow(value);
      },
      onMetricChange: (value): void => {
        this.changeMetric(value);
      },
    };
  }

  private updateUrl(): void {
    const path =
      this.currentQueueChannelId == null
        ? `/leaderboard/${this.guildId}`
        : `/leaderboard/${this.guildId}/${this.currentQueueChannelId}`;
    const query = new URLSearchParams();
    if (this.currentWindow != null) {
      query.set("window", this.currentWindow.toLowerCase());
    }
    if (this.currentMetric != null) {
      query.set("metric", this.currentMetric.toLowerCase());
    }
    const queryString = query.toString();
    window.history.pushState({}, "", `${path}${queryString === "" ? "" : `?${queryString}`}`);
  }
}
