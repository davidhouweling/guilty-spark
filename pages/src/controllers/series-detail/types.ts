import type {
  ConfiguredTeamContext,
  SeriesDetailResponse,
  SeriesTeamMappingMode,
} from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesMatchAnalyticsById } from "../../components/series-stats/types";
import type { SeriesMatchesService } from "../../services/series-matches/types";
import type { SeriesAnalyticsController } from "../series-analytics/series-analytics-controller";

export interface SeriesDetailRequest {
  readonly seriesId: string;
  readonly matchIds: readonly string[];
  readonly teamMappingMode?: SeriesTeamMappingMode | undefined;
  readonly configuredTeamContext?: ConfiguredTeamContext | undefined;
}

export type SeriesDetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "loaded";
      readonly data: SeriesDetailResponse;
      readonly analyticsByMatchId: SeriesMatchAnalyticsById;
    };

export interface SeriesDetailControllerConfig {
  readonly seriesMatchesService: SeriesMatchesService;
  readonly trackerId?: string | undefined;
  readonly createSeriesAnalyticsController: (
    onChange: (analyticsByMatchId: SeriesMatchAnalyticsById) => void,
  ) => SeriesAnalyticsController;
  readonly onChange: (seriesId: string, state: SeriesDetailState) => void;
}
