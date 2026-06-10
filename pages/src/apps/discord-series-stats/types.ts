import type {
  DiscordSeriesStats,
  DiscordSeriesStatsResolved,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import type { ComponentLoaderStatus } from "../../components/component-loader/component-loader";

export interface DiscordSeriesStatsSnapshot {
  readonly loaderStatus: ComponentLoaderStatus;
  readonly response: DiscordSeriesStats | null;
  readonly errorMessage: string | null;
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
      readonly data: DiscordSeriesStatsResolved;
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
