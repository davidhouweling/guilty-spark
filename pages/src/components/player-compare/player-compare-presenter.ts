import {
  LeaderboardMetric,
  LeaderboardWindow,
  getLeaderboardMetricComparisonDirection,
} from "@guilty-spark/shared/halo/leaderboard";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import {
  formatMetricValue,
  formatPerfects,
  getObjectiveGamesPlayedForMetric,
  getPlayerMetricValue,
  getPlayerStatMetricLabel,
} from "@guilty-spark/shared/halo/leaderboard-formatting";
import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareService } from "../../services/player-compare/player-compare-types";
import type { PlayerCompareSnapshot, PlayerCompareStore } from "./player-compare-store";
import type {
  CreatePlayerCompareConfig,
  PlayerCompareHeadToHeadCell,
  PlayerCompareHeadToHeadMetric,
  PlayerCompareHeadToHeadRow,
  PlayerCompareStatRow,
  PlayerCompareTabId,
  PlayerCompareValueCell,
  PlayerCompareViewModel,
} from "./types";
import { PlayerCompareHeadToHeadMetric as HeadToHeadMetric } from "./types";

const COMPARE_METRICS: readonly LeaderboardMetric[] = [
  LeaderboardMetric.SeriesWinRate,
  LeaderboardMetric.GamesWinRate,
  LeaderboardMetric.SeriesPlayed,
  LeaderboardMetric.SeriesWins,
  LeaderboardMetric.GamesPlayed,
  LeaderboardMetric.GameWins,
  LeaderboardMetric.Kills,
  LeaderboardMetric.Deaths,
  LeaderboardMetric.Assists,
  LeaderboardMetric.Kda,
  LeaderboardMetric.Accuracy,
  LeaderboardMetric.DamageDealt,
  LeaderboardMetric.DamageTaken,
  LeaderboardMetric.DamageRatio,
  LeaderboardMetric.AvgLifeSeconds,
  LeaderboardMetric.AvgDamagePerLife,
];

const MIN_GAMES_PLAYED_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

const HEAD_TO_HEAD_METRIC_OPTIONS: readonly { value: HeadToHeadMetric; label: string }[] = [
  { value: HeadToHeadMetric.SeriesWinRateAgainst, label: "Series win % vs" },
  { value: HeadToHeadMetric.GamesWinRateAgainst, label: "Games win % vs" },
  { value: HeadToHeadMetric.KillsAgainst, label: "Kills vs" },
  { value: HeadToHeadMetric.AvgKillsAgainst, label: "Avg kills/game vs" },
];

function getOptionalQueryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value === "" ? undefined : value;
}

function containsGamertag(gamertags: readonly string[], value: string): boolean {
  return gamertags.some((gamertag) => gamertag.toLowerCase() === value.toLowerCase());
}

export class PlayerComparePresenter {
  private readonly store: PlayerCompareStore;
  private readonly service: PlayerCompareService;
  private readonly initialResponse: PlayerCompareResponse | undefined;
  private currentGamertags: readonly string[];
  private currentGuildId: string | undefined;
  private currentQueueChannelId: string | undefined;
  private currentWindow: LeaderboardWindow | undefined;
  private currentMinGamesPlayed: number | undefined;
  private requestNumber = 0;
  private isDisposed = false;

  constructor({ store, service, gamertags, initialResponse }: CreatePlayerCompareConfig & { store: PlayerCompareStore }) {
    this.store = store;
    this.service = service;
    this.currentGamertags = gamertags;
    this.initialResponse = initialResponse;
    const url = new URL(window.location.href);
    this.currentGuildId = getOptionalQueryParam(url, "guildId") ?? initialResponse?.selectedGuildId;
    this.currentQueueChannelId = getOptionalQueryParam(url, "queueChannelId");
    this.currentWindow = this.findWindow(url.searchParams.get("window"));
    this.currentMinGamesPlayed = this.findMinGamesPlayed(url.searchParams.get("minGamesPlayed"));
  }

  start(): void {
    if (this.initialResponse != null) {
      this.currentGuildId = this.initialResponse.selectedGuildId;
      this.currentWindow = this.initialResponse.window;
      this.currentMinGamesPlayed = this.initialResponse.minGamesPlayed;
      this.store.setLoaded(this.currentGamertags, this.initialResponse);
      return;
    }

    if (this.currentGamertags.length < 2) {
      this.store.setLoaded(this.currentGamertags, null);
      return;
    }

    this.load();
  }

  load(): void {
    if (this.currentGamertags.length < 2) {
      this.store.setLoaded(this.currentGamertags, null);
      return;
    }

    this.requestNumber += 1;
    this.store.setLoading(this.currentGamertags);
    void this.loadAsync(this.requestNumber);
  }

  private async loadAsync(activeRequest: number): Promise<void> {
    try {
      const response = await this.service.getPlayerCompare({
        gamertags: this.currentGamertags,
        guildId: this.currentGuildId,
        queueChannelId: this.currentQueueChannelId,
        window: this.currentWindow,
        minGamesPlayed: this.currentMinGamesPlayed,
      });
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }

      this.currentGuildId = response.selectedGuildId;
      this.currentWindow = response.window;
      this.currentMinGamesPlayed = response.minGamesPlayed;
      this.store.setLoaded(this.currentGamertags, response);
    } catch {
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.store.setError("Unable to load player comparison.");
    }
  }

  changeAddPlayerValue(value: string): void {
    this.store.setAddPlayerValue(value);
  }

  addPlayer(): void {
    const value = this.store.getSnapshot().addPlayerValue.trim();
    if (value === "" || containsGamertag(this.currentGamertags, value) || this.currentGamertags.length >= 8) {
      return;
    }

    this.currentGamertags = [...this.currentGamertags, value];
    this.store.setAddPlayerValue("");
    this.updateUrl();
    this.load();
  }

  removePlayer(gamertag: string): void {
    const nextGamertags = this.currentGamertags.filter(
      (currentGamertag) => currentGamertag.toLowerCase() !== gamertag.toLowerCase(),
    );
    if (nextGamertags.length === this.currentGamertags.length) {
      return;
    }

    this.currentGamertags = nextGamertags;
    this.updateUrl();
    this.load();
  }

  changeGuild(value: string): void {
    this.currentGuildId = value;
    this.currentQueueChannelId = undefined;
    this.updateUrl();
    this.load();
  }

  changeQueue(value: string): void {
    this.currentQueueChannelId = value === "all" ? undefined : value;
    this.updateUrl();
    this.load();
  }

  changeWindow(value: string): void {
    this.currentWindow = this.findWindow(value);
    this.updateUrl();
    this.load();
  }

  changeMinGamesPlayed(value: string): void {
    const minGamesPlayed = this.findMinGamesPlayed(value);
    if (minGamesPlayed == null) {
      return;
    }
    this.currentMinGamesPlayed = minGamesPlayed;
    this.updateUrl();
    this.load();
  }

  changeTab(tabId: PlayerCompareTabId): void {
    this.store.setTab(tabId);
  }

  changeHeadToHeadMetric(value: string): void {
    const metric = this.findHeadToHeadMetric(value);
    if (metric == null) {
      return;
    }

    this.store.setHeadToHeadMetric(metric);
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
  }

  present(snapshot: PlayerCompareSnapshot): PlayerCompareViewModel {
    const response = snapshot.response;
    const gamertags = response?.players.map((player) => player.player.gamertag) ?? snapshot.gamertags;
    const selectedGuildId = response?.selectedGuildId ?? this.currentGuildId ?? "";
    const selectedServer = response?.servers.find((server) => server.guildId === selectedGuildId);
    const selectedQueueOption = selectedServer?.queueOptions.find(
      (option) => option.channelId === this.currentQueueChannelId,
    );
    const queueLabel = selectedQueueOption?.label ?? "All queues";
    const selectedWindow = response?.window ?? this.currentWindow ?? LeaderboardWindow.ThreeMonths;
    const scopeLabel = response == null ? "Add at least two players to compare." : `${response.selectedGuildName} / ${queueLabel} / ${selectedWindow}`;
    const selectedMinGamesPlayed = this.currentMinGamesPlayed ?? response?.minGamesPlayed ?? 5;

    return {
      state: snapshot.status,
      errorMessage: snapshot.errorMessage,
      gamertags,
      title: gamertags.length === 0 ? "Compare players" : gamertags.join(" vs "),
      scopeLabel,
      servers: response?.servers.map((server) => ({ value: server.guildId, label: server.guildName })) ?? [],
      queueOptions: [
        { value: "all", label: "All configured queues" },
        ...(selectedServer?.queueOptions.map((option) => ({ value: option.channelId, label: option.label })) ?? []),
      ],
      windowOptions: [
        { value: LeaderboardWindow.OneWeek, label: "1 week" },
        { value: LeaderboardWindow.OneMonth, label: "1 month" },
        { value: LeaderboardWindow.ThreeMonths, label: "3 months" },
        { value: LeaderboardWindow.SixMonths, label: "6 months" },
        { value: LeaderboardWindow.TwelveMonths, label: "12 months" },
        ...(response?.resetAt == null ? [] : [{ value: LeaderboardWindow.LastReset, label: "Since last reset" }]),
      ],
      selectedGuildId,
      selectedQueueChannelId: this.currentQueueChannelId ?? null,
      selectedWindow,
      selectedMinGamesPlayed,
      minGamesPlayedOptions: MIN_GAMES_PLAYED_OPTIONS.map((value) => ({
        value: value.toString(),
        label: value.toString(),
      })),
      selectedTabId: snapshot.tabId,
      statsRows: this.getStatsRows(response),
      headToHeadMetricOptions: HEAD_TO_HEAD_METRIC_OPTIONS,
      selectedHeadToHeadMetric: snapshot.headToHeadMetric,
      headToHeadRows: this.getHeadToHeadRows(response, snapshot.headToHeadMetric),
      addPlayerValue: snapshot.addPlayerValue,
      canAddPlayer:
        snapshot.addPlayerValue.trim() !== "" &&
        !containsGamertag(gamertags, snapshot.addPlayerValue.trim()) &&
        gamertags.length < 8,
      statusText: snapshot.status === "loading" ? "LOADING" : `${gamertags.length.toString()} PLAYERS`,
      onAddPlayerValueChange: (value): void => {
        this.changeAddPlayerValue(value);
      },
      onAddPlayer: (): void => {
        this.addPlayer();
      },
      onRemovePlayer: (gamertag): void => {
        this.removePlayer(gamertag);
      },
      onGuildChange: (value): void => {
        this.changeGuild(value);
      },
      onQueueChange: (value): void => {
        this.changeQueue(value);
      },
      onWindowChange: (value): void => {
        this.changeWindow(value);
      },
      onMinGamesPlayedChange: (value): void => {
        this.changeMinGamesPlayed(value);
      },
      onHeadToHeadMetricChange: (value): void => {
        this.changeHeadToHeadMetric(value);
      },
      onTabChange: (tab): void => {
        this.changeTab(tab);
      },
    };
  }

  private getStatsRows(response: PlayerCompareResponse | null): readonly PlayerCompareStatRow[] {
    if (response == null) {
      return [];
    }

    return COMPARE_METRICS.map((metric) => {
      const values: PlayerCompareValueCell[] = response.players.map((player) => {
        const stats = player.stats;
        if (stats == null) {
          return { gamertag: player.player.gamertag, text: "-", sortValue: undefined };
        }

        const metricValue = getPlayerMetricValue(stats, metric);
        const objectiveGamesPlayed = getObjectiveGamesPlayedForMetric(stats, metric);
        return {
          gamertag: player.player.gamertag,
          text: formatMetricValue(metricValue, metric, {
            seriesWins: stats.SeriesWins,
            seriesPlayed: stats.SeriesPlayed,
            gameWins: stats.GameWins,
            gamesPlayed: stats.GamesPlayed,
            objectiveGamesPlayed,
          }),
          sortValue: metricValue,
        };
      });

      return {
        stat: getPlayerStatMetricLabel(metric),
        values: this.applyValueComparison(metric, values),
      };
    });
  }

  private applyValueComparison(
    metric: LeaderboardMetric,
    values: readonly PlayerCompareValueCell[],
  ): readonly PlayerCompareValueCell[] {
    const numericValues = values.filter((value) => value.sortValue != null);
    if (numericValues.length < 2) {
      return values;
    }

    const sortValues = numericValues.map((value) => value.sortValue ?? 0);
    const bestValue =
      getLeaderboardMetricComparisonDirection(metric) === "asc" ? Math.min(...sortValues) : Math.max(...sortValues);
    const worstValue =
      getLeaderboardMetricComparisonDirection(metric) === "asc" ? Math.max(...sortValues) : Math.min(...sortValues);

    if (bestValue === worstValue) {
      return values;
    }

    return values.map((value) => {
      if (value.sortValue === bestValue) {
        return { ...value, comparison: "best" };
      }
      if (value.sortValue === worstValue) {
        return { ...value, comparison: "worst" };
      }

      return value;
    });
  }

  private getHeadToHeadRows(
    response: PlayerCompareResponse | null,
    metric: PlayerCompareHeadToHeadMetric,
  ): readonly PlayerCompareHeadToHeadRow[] {
    if (response == null) {
      return [];
    }

    return response.players.map((player) => ({
      playerGamertag: player.player.gamertag,
      values: this.applyHeadToHeadValueComparison(
        response.players.map((opponent) =>
          this.getHeadToHeadCell(response, player.player.xboxXuid, opponent.player.xboxXuid, opponent.player.gamertag, metric),
        ),
      ),
    }));
  }

  private getHeadToHeadCell(
    response: PlayerCompareResponse,
    playerXboxXuid: string,
    opponentXboxXuid: string,
    opponentGamertag: string,
    metric: PlayerCompareHeadToHeadMetric,
  ): PlayerCompareHeadToHeadCell {
    if (playerXboxXuid === opponentXboxXuid) {
      return { opponentGamertag, text: "-", sortValue: undefined };
    }

    const pair = response.pairSummaries.find(
      (summary) => summary.playerXboxXuid === playerXboxXuid && summary.opponentXboxXuid === opponentXboxXuid,
    );
    if (pair == null) {
      return { opponentGamertag, text: "-", sortValue: undefined };
    }

    switch (metric) {
      case HeadToHeadMetric.SeriesWinRateAgainst: {
        return {
          opponentGamertag,
          text: this.formatWinRate(pair.playerSeriesWinsAgainst, pair.seriesPlayedAgainst),
          sortValue: pair.seriesPlayedAgainst === 0 ? undefined : pair.playerSeriesWinsAgainst / pair.seriesPlayedAgainst,
        };
      }
      case HeadToHeadMetric.GamesWinRateAgainst: {
        return {
          opponentGamertag,
          text: this.formatWinRate(pair.playerGameWinsAgainst, pair.gamesPlayedAgainst),
          sortValue: pair.gamesPlayedAgainst === 0 ? undefined : pair.playerGameWinsAgainst / pair.gamesPlayedAgainst,
        };
      }
      case HeadToHeadMetric.KillsAgainst: {
        return {
          opponentGamertag,
          text: `${pair.playerKills.toLocaleString()} (${formatPerfects(pair.playerPerfects)})`,
          sortValue: pair.playerKills,
        };
      }
      case HeadToHeadMetric.AvgKillsAgainst: {
        return {
          opponentGamertag,
          text:
            pair.headToHeadGamesPlayed === 0
              ? "-"
              : `${(pair.playerKills / pair.headToHeadGamesPlayed).toLocaleString(undefined, { maximumFractionDigits: 1 })} (${formatPerfects(pair.playerPerfects)})`,
          sortValue: pair.headToHeadGamesPlayed === 0 ? undefined : pair.playerKills / pair.headToHeadGamesPlayed,
        };
      }
      default: {
        throw new UnreachableError(metric);
      }
    }
  }

  private formatWinRate(wins: number, total: number): string {
    return total === 0 ? "-" : `${((wins / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% (${wins.toLocaleString()}/${total.toLocaleString()})`;
  }

  private applyHeadToHeadValueComparison(
    values: readonly PlayerCompareHeadToHeadCell[],
  ): readonly PlayerCompareHeadToHeadCell[] {
    const numericValues = values.filter((value) => value.sortValue != null);
    if (numericValues.length < 2) {
      return values;
    }

    const sortValues = numericValues.map((value) => value.sortValue ?? 0);
    const bestValue = Math.max(...sortValues);
    const worstValue = Math.min(...sortValues);
    if (bestValue === worstValue) {
      return values;
    }

    return values.map((value) => {
      if (value.sortValue === bestValue) {
        return { ...value, comparison: "best" };
      }
      if (value.sortValue === worstValue) {
        return { ...value, comparison: "worst" };
      }

      return value;
    });
  }

  private findWindow(value: string | null): LeaderboardWindow | undefined {
    return Object.values(LeaderboardWindow).find((candidate) => candidate.toLowerCase() === value?.toLowerCase());
  }

  private findMinGamesPlayed(value: string | null): number | undefined {
    const parsedValue = value == null ? undefined : Number(value);
    return parsedValue != null && MIN_GAMES_PLAYED_OPTIONS.includes(parsedValue) ? parsedValue : undefined;
  }

  private findHeadToHeadMetric(value: string): PlayerCompareHeadToHeadMetric | null {
    return HEAD_TO_HEAD_METRIC_OPTIONS.find((option) => option.value === value)?.value ?? null;
  }

  private updateUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete("gamertag");
    for (const gamertag of this.currentGamertags) {
      url.searchParams.append("gamertag", gamertag);
    }

    if (this.currentGamertags.length < 2) {
      url.searchParams.delete("guildId");
      url.searchParams.delete("queueChannelId");
      url.searchParams.delete("window");
      url.searchParams.delete("minGamesPlayed");
      window.history.pushState({}, "", url);
      return;
    }

    if (this.currentGuildId == null) {
      url.searchParams.delete("guildId");
    } else {
      url.searchParams.set("guildId", this.currentGuildId);
    }
    if (this.currentQueueChannelId == null) {
      url.searchParams.delete("queueChannelId");
    } else {
      url.searchParams.set("queueChannelId", this.currentQueueChannelId);
    }
    if (this.currentWindow == null) {
      url.searchParams.delete("window");
    } else {
      url.searchParams.set("window", this.currentWindow);
    }
    if (this.currentMinGamesPlayed == null) {
      url.searchParams.delete("minGamesPlayed");
    } else {
      url.searchParams.set("minGamesPlayed", this.currentMinGamesPlayed.toString());
    }
    window.history.pushState({}, "", url);
  }
}
