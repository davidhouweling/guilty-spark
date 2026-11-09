import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { SeriesMatchAnalyticsById } from "../../components/series-stats/types";
import type { DiscordSeriesStatsDetailResult } from "../../services/stats/discord-series-types";

type DiscordSeriesStatsResponse = DiscordSeriesStatsDetailResult["data"];

export interface DiscordSeriesStatsSnapshot {
  readonly loaderStatus: ComponentLoaderStatus;
  readonly response: DiscordSeriesStatsResponse | null;
  readonly errorMessage: string | null;
  readonly analyticsByMatchId: SeriesMatchAnalyticsById;
}

export type DiscordSeriesStatsViewModel =
  | {
      readonly state: "loading";
    }
  | {
      readonly state: "error";
      readonly message: string;
    }
  | {
      readonly state: "resolved";
      readonly data: SeriesDetailResponse;
    }
  | {
      readonly state: "pending-index";
      readonly retryAfterSeconds: number;
    }
  | {
      readonly state: "forbidden";
      readonly reason: string;
    }
  | {
      readonly state: "not-found";
      readonly reason: string;
    };
