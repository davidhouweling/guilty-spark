import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";
import { seriesMatchesRoute } from "./series-matches";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
  seriesMatchesRoute(router, installServices);
};
