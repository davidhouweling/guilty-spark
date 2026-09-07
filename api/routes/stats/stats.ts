import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";
import { seriesMatchesRoute } from "./series-matches";
import { statsPlayerRoute } from "./player";
import { statsCompareRoute } from "./compare";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
  seriesMatchesRoute(router, installServices);
  statsPlayerRoute(router, installServices);
  statsCompareRoute(router, installServices);
};
