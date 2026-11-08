import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";
import { seriesMatchesRoute } from "./series-matches";
import { matchDetailsRoute } from "./match-details";
import { seriesDetailsRoute } from "./series-details";
import { statsPlayerRoute } from "./player";
import { statsCompareRoute } from "./compare";
import { statsPreSeriesRoute } from "./pre-series";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
  seriesMatchesRoute(router, installServices);
  matchDetailsRoute(router, installServices);
  seriesDetailsRoute(router, installServices);
  statsPlayerRoute(router, installServices);
  statsCompareRoute(router, installServices);
  statsPreSeriesRoute(router, installServices);
};
