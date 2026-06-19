import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";
import { batchMatchAnalyticsRoute } from "./batch-analytics";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
  batchMatchAnalyticsRoute(router, installServices);
};
