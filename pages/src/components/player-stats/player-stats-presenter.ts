import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import {
  formatMetricValue,
  getPlayerMetricValue,
  getObjectiveGamesPlayedForMetric,
  getPlayerStatMetricLabel,
  getRankText,
} from "@guilty-spark/shared/halo/leaderboard-formatting";
import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsService } from "../../services/player-stats/player-stats-types";
import type { PlayerStatsSnapshot, PlayerStatsStore } from "./player-stats-store";
import type {
  CreatePlayerStatsConfig,
  PlayerLeaderboardStatRow,
  PlayerHeadToHeadTableRow,
  PlayerStatsTabId,
  PlayerStatsViewModel,
} from "./types";

const ALL_PLAYER_STAT_METRICS: readonly LeaderboardMetric[] = [
  LeaderboardMetric.SeriesWinRate,
  LeaderboardMetric.GamesWinRate,
  LeaderboardMetric.SeriesPlayed,
  LeaderboardMetric.SeriesWins,
  LeaderboardMetric.GamesPlayed,
  LeaderboardMetric.GameWins,
  LeaderboardMetric.PersonalScore,
  LeaderboardMetric.AvgPersonalScorePerGame,
  LeaderboardMetric.AvgPersonalScorePerSeries,
  LeaderboardMetric.Kills,
  LeaderboardMetric.AvgKillsPerGame,
  LeaderboardMetric.AvgKillsPerSeries,
  LeaderboardMetric.Deaths,
  LeaderboardMetric.AvgDeathsPerGame,
  LeaderboardMetric.AvgDeathsPerSeries,
  LeaderboardMetric.Assists,
  LeaderboardMetric.AvgAssistsPerGame,
  LeaderboardMetric.AvgAssistsPerSeries,
  LeaderboardMetric.Kda,
  LeaderboardMetric.HeadshotKills,
  LeaderboardMetric.AvgHeadshotKillsPerGame,
  LeaderboardMetric.AvgHeadshotKillsPerSeries,
  LeaderboardMetric.ShotsHit,
  LeaderboardMetric.AvgShotsHitPerGame,
  LeaderboardMetric.AvgShotsHitPerSeries,
  LeaderboardMetric.ShotsFired,
  LeaderboardMetric.AvgShotsFiredPerGame,
  LeaderboardMetric.AvgShotsFiredPerSeries,
  LeaderboardMetric.Accuracy,
  LeaderboardMetric.DamageDealt,
  LeaderboardMetric.AvgDamageDealtPerGame,
  LeaderboardMetric.AvgDamageDealtPerSeries,
  LeaderboardMetric.DamageTaken,
  LeaderboardMetric.AvgDamageTakenPerGame,
  LeaderboardMetric.AvgDamageTakenPerSeries,
  LeaderboardMetric.DamageRatio,
  LeaderboardMetric.AvgLifeSeconds,
  LeaderboardMetric.AvgDamagePerLife,
  LeaderboardMetric.ObjectiveTime,
  LeaderboardMetric.AvgObjectiveTimePerGame,
  LeaderboardMetric.ObjectiveTeamContribution,
  LeaderboardMetric.MedalPoints,
  LeaderboardMetric.AvgMedalPointsPerGame,
  LeaderboardMetric.AvgMedalPointsPerSeries,
  LeaderboardMetric.MythicMedals,
  LeaderboardMetric.AvgMythicMedalsPerGame,
  LeaderboardMetric.AvgMythicMedalsPerSeries,
  LeaderboardMetric.FlagCaptures,
  LeaderboardMetric.AvgFlagCapturesPerObjective,
  LeaderboardMetric.FlagCaptureAssists,
  LeaderboardMetric.AvgFlagCaptureAssistsPerObjective,
  LeaderboardMetric.FlagGrabs,
  LeaderboardMetric.AvgFlagGrabsPerObjective,
  LeaderboardMetric.FlagReturns,
  LeaderboardMetric.AvgFlagReturnsPerObjective,
  LeaderboardMetric.FlagSecures,
  LeaderboardMetric.AvgFlagSecuresPerObjective,
  LeaderboardMetric.FlagSteals,
  LeaderboardMetric.AvgFlagStealsPerObjective,
  LeaderboardMetric.FlagCarriersKilled,
  LeaderboardMetric.AvgFlagCarriersKilledPerObjective,
  LeaderboardMetric.FlagReturnersKilled,
  LeaderboardMetric.AvgFlagReturnersKilledPerObjective,
  LeaderboardMetric.FlagCarrierKills,
  LeaderboardMetric.AvgFlagCarrierKillsPerObjective,
  LeaderboardMetric.FlagReturnerKills,
  LeaderboardMetric.AvgFlagReturnerKillsPerObjective,
  LeaderboardMetric.StrongholdCaptures,
  LeaderboardMetric.AvgStrongholdCapturesPerObjective,
  LeaderboardMetric.StrongholdSecures,
  LeaderboardMetric.AvgStrongholdSecuresPerObjective,
  LeaderboardMetric.StrongholdOffensiveKills,
  LeaderboardMetric.AvgStrongholdOffensiveKillsPerObjective,
  LeaderboardMetric.StrongholdDefensiveKills,
  LeaderboardMetric.AvgStrongholdDefensiveKillsPerObjective,
  LeaderboardMetric.HillScoringTicks,
  LeaderboardMetric.AvgHillScoringTicksPerObjective,
  LeaderboardMetric.HillOffensiveKills,
  LeaderboardMetric.AvgHillOffensiveKillsPerObjective,
  LeaderboardMetric.HillDefensiveKills,
  LeaderboardMetric.AvgHillDefensiveKillsPerObjective,
  LeaderboardMetric.BallScoringTicks,
  LeaderboardMetric.AvgBallScoringTicksPerObjective,
  LeaderboardMetric.BallGrabs,
  LeaderboardMetric.AvgBallGrabsPerObjective,
  LeaderboardMetric.BallCarriersKilled,
  LeaderboardMetric.AvgBallCarriersKilledPerObjective,
  LeaderboardMetric.BallCarrierKills,
  LeaderboardMetric.AvgBallCarrierKillsPerObjective,
];

function formatRecord(wins: number, losses: number, total: number): { text: string; rate: number } {
  if (total === 0) {
    return { text: "-", rate: -1 };
  }
  const percentage = (wins / total) * 100;
  return {
    text: `${wins.toString()} - ${losses.toString()} (${percentage.toFixed(1)}%)`,
    rate: percentage,
  };
}

export class PlayerStatsPresenter {
  private readonly store: PlayerStatsStore;
  private readonly service: PlayerStatsService;
  private readonly gamertag: string;
  private readonly initialResponse: PlayerStatsResponse | undefined;
  private currentGuildId: string | undefined;
  private currentQueueChannelId: string | undefined;
  private currentWindow: LeaderboardWindow | undefined;
  private requestNumber = 0;
  private isDisposed = false;

  constructor({ store, service, gamertag, initialResponse }: CreatePlayerStatsConfig & { store: PlayerStatsStore }) {
    this.store = store;
    this.service = service;
    this.gamertag = gamertag;
    this.initialResponse = initialResponse;
    const url = new URL(window.location.href);
    this.currentGuildId = url.searchParams.get("guildId") ?? initialResponse?.selectedGuildId;
    this.currentQueueChannelId = url.searchParams.get("queueChannelId") ?? undefined;
    this.currentWindow = this.findWindow(url.searchParams.get("window"));
  }

  start(): void {
    if (this.initialResponse != null) {
      this.currentGuildId = this.initialResponse.selectedGuildId;
      this.currentWindow = this.initialResponse.window;
      this.store.setLoaded(this.initialResponse);
      return;
    }
    this.load();
  }

  load(): void {
    this.requestNumber += 1;
    this.store.setLoading();
    void this.loadAsync(this.requestNumber);
  }

  private async loadAsync(activeRequest: number): Promise<void> {
    try {
      const response = await this.service.getPlayerStats({
        gamertag: this.gamertag,
        guildId: this.currentGuildId,
        queueChannelId: this.currentQueueChannelId,
        window: this.currentWindow,
      });
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.currentGuildId = response.selectedGuildId;
      this.currentWindow = response.window;
      this.store.setLoaded(response);
    } catch {
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.store.setError("Unable to load player stats.");
    }
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

  changeTab(tabId: PlayerStatsTabId): void {
    this.store.setTab(tabId);
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
  }

  present(snapshot: PlayerStatsSnapshot): PlayerStatsViewModel {
    const { response, tabId } = snapshot;
    const stats = response?.stats;
    const ranks = response?.ranks ?? {};
    const totalPlayers = response?.totalPlayers ?? null;

    const statsRows: readonly PlayerLeaderboardStatRow[] =
      stats == null
        ? []
        : ALL_PLAYER_STAT_METRICS.map((metric) => {
            const metricValue = getPlayerMetricValue(stats, metric);
            const objectiveGamesPlayed = getObjectiveGamesPlayedForMetric(stats, metric);
            const rank = ranks[metric] ?? null;
            return {
              stat: getPlayerStatMetricLabel(metric),
              rank: getRankText(metric, rank, totalPlayers),
              value: formatMetricValue(metricValue, metric, {
                seriesWins: stats.SeriesWins,
                seriesPlayed: stats.SeriesPlayed,
                gameWins: stats.GameWins,
                gamesPlayed: stats.GamesPlayed,
                objectiveGamesPlayed,
              }),
              sortRank: rank?.rank ?? undefined,
              sortValue: metricValue,
            };
          });

    const headToHeadRows: readonly PlayerHeadToHeadTableRow[] = (response?.headToHeadSummaries ?? []).map((summary) => {
      const killsText = `${summary.kills.toLocaleString()} (${summary.killsPerfects.toLocaleString()} perfs)`;
      const deathsText = `${summary.deaths.toLocaleString()} (${summary.deathsPerfects.toLocaleString()} perfs)`;

      const gamesWithLosses = Math.max(0, summary.gamesWith - summary.gameWinsWith);
      const gamesWithRecord = formatRecord(summary.gameWinsWith, gamesWithLosses, summary.gamesWith);

      const seriesWithLosses = Math.max(0, summary.seriesWith - summary.seriesWinsWith);
      const seriesWithRecord = formatRecord(summary.seriesWinsWith, seriesWithLosses, summary.seriesWith);

      const gamesAgainstLosses = summary.opponentGameWins;
      const gamesAgainstRecord = formatRecord(summary.gameWinsAgainst, gamesAgainstLosses, summary.gamesAgainst);

      const seriesAgainstLosses = summary.opponentSeriesWins;
      const seriesAgainstRecord = formatRecord(summary.seriesWinsAgainst, seriesAgainstLosses, summary.seriesAgainst);

      return {
        player: summary.gamertag,
        kills: summary.kills,
        killsText,
        deaths: summary.deaths,
        deathsText,
        gamesWithTotal: summary.gamesWith,
        gamesWithText: gamesWithRecord.text,
        gamesWithWinRate: gamesWithRecord.rate,
        seriesWithTotal: summary.seriesWith,
        seriesWithText: seriesWithRecord.text,
        seriesWithWinRate: seriesWithRecord.rate,
        gamesAgainstTotal: summary.gamesAgainst,
        gamesAgainstText: gamesAgainstRecord.text,
        gamesAgainstWinRate: gamesAgainstRecord.rate,
        seriesAgainstTotal: summary.seriesAgainst,
        seriesAgainstText: seriesAgainstRecord.text,
        seriesAgainstWinRate: seriesAgainstRecord.rate,
      };
    });

    const selectedGuildId = response?.selectedGuildId ?? this.currentGuildId ?? "";
    const selectedServer = response?.servers.find((server) => server.guildId === selectedGuildId);
    const selectedQueueOption = selectedServer?.queueOptions.find(
      (option) => option.channelId === this.currentQueueChannelId,
    );
    const queueLabel = selectedQueueOption?.label ?? "All queues";
    const windowLabel = response?.window ?? this.currentWindow ?? LeaderboardWindow.ThreeMonths;
    const scopeLabel = `${response?.selectedGuildName ?? ""} / ${queueLabel} / ${windowLabel}`;

    const minGames = response?.minGamesPlayed ?? 5;
    const totalPlayersText = totalPlayers == null ? "Unknown" : totalPlayers.toLocaleString();
    const statsFooter =
      stats == null ? undefined : `Min games: ${minGames.toString()} | Total players: ${totalPlayersText}`;
    const headToHeadFooter = "Showing top 25 opponents and teammates by match activity";

    return {
      state: snapshot.status,
      errorMessage: snapshot.errorMessage,
      gamertag: response?.player.gamertag ?? this.gamertag,
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
      selectedWindow: response?.window ?? this.currentWindow ?? LeaderboardWindow.ThreeMonths,
      selectedTabId: tabId,
      statsRows,
      headToHeadRows,
      statsFooter,
      headToHeadFooter,
      onGuildChange: (value): void => {
        this.changeGuild(value);
      },
      onQueueChange: (value): void => {
        this.changeQueue(value);
      },
      onWindowChange: (value): void => {
        this.changeWindow(value);
      },
      onTabChange: (tab): void => {
        this.changeTab(tab);
      },
    };
  }

  private findWindow(value: string | null): LeaderboardWindow | undefined {
    return Object.values(LeaderboardWindow).find((candidate) => candidate.toLowerCase() === value?.toLowerCase());
  }

  private updateUrl(): void {
    const url = new URL(window.location.href);
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
    window.history.pushState({}, "", url);
  }
}
