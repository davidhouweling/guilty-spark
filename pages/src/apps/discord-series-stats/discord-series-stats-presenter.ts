import type { DiscordSeriesStats } from "@guilty-spark/shared/contracts/stats/discord-series";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import type { DiscordSeriesStatsSnapshot, DiscordSeriesStatsViewModel } from "./types";

interface DiscordSeriesStatsPresenterDependencies {
  readonly store: DiscordSeriesStatsStore;
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly guildId: string;
  readonly queueNumber: string;
}

export class DiscordSeriesStatsPresenter {
  private readonly store: DiscordSeriesStatsStore;
  private readonly discordSeriesStatsService: DiscordSeriesStatsService;
  private readonly guildId: string;
  private readonly queueNumber: string;
  private isDisposed = false;
  private requestNumber = 0;

  constructor({ store, discordSeriesStatsService, guildId, queueNumber }: DiscordSeriesStatsPresenterDependencies) {
    this.store = store;
    this.discordSeriesStatsService = discordSeriesStatsService;
    this.guildId = guildId;
    this.queueNumber = queueNumber;
  }

  private async fetchStats(): Promise<DiscordSeriesStats> {
    const response = await this.discordSeriesStatsService.getStats(this.guildId, this.queueNumber);
    return response.data;
  }

  start(): void {
    this.requestNumber += 1;
    const activeRequest = this.requestNumber;

    this.store.setLoading();

    this.fetchStats()
      .then((response) => {
        if (this.isDisposed || activeRequest !== this.requestNumber) {
          return;
        }

        this.store.setLoaded(response);
      })
      .catch(() => {
        if (this.isDisposed || activeRequest !== this.requestNumber) {
          return;
        }

        this.store.setError("Failed to load stats");
      });
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
  }

  static present(snapshot: DiscordSeriesStatsSnapshot): DiscordSeriesStatsViewModel {
    if (
      snapshot.loaderStatus === ComponentLoaderStatus.PENDING ||
      snapshot.loaderStatus === ComponentLoaderStatus.LOADING
    ) {
      return {
        state: "loading",
      };
    }

    if (snapshot.loaderStatus === ComponentLoaderStatus.ERROR) {
      return {
        state: "error",
        message: snapshot.errorMessage ?? "Failed to load stats",
      };
    }

    const { response } = snapshot;
    if (response == null) {
      return {
        state: "error",
        message: "Stats response was empty",
      };
    }

    switch (response.status) {
      case "resolved": {
        return {
          state: "resolved",
          data: response,
        };
      }
      case "pending-index": {
        return {
          state: "pending-index",
          retryAfterSeconds: response.retryAfterSeconds,
        };
      }
      case "forbidden": {
        return {
          state: "forbidden",
          reason: response.reason,
        };
      }
      case "not-found": {
        return {
          state: "not-found",
          reason: response.reason,
        };
      }
      default: {
        throw new UnreachableError(response);
      }
    }
  }
}
