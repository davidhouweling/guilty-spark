import type { RoutesRegisterHandler } from "../base/types";
import { statsDiscordSeriesRoute } from "./discord-series";

export const statsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  statsDiscordSeriesRoute(router, installServices);
};
