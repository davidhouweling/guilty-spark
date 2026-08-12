import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";
import { seriesMatchesRoute } from "./series-matches";
import { leaderboardRoute } from "./leaderboard";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
  seriesMatchesRoute(router, installServices);
  leaderboardRoute(router, installServices);
};
