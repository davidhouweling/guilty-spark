import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";
import { seriesMatchesRoute } from "./series-matches";
import { matchScoreProgressionRoute } from "./match-score-progression";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
  seriesMatchesRoute(router, installServices);
  matchScoreProgressionRoute(router, installServices);
};
