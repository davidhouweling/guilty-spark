import type { Services } from "../../services/install";

export interface StatsHandlerContext {
  readonly services: Services;
  readonly env: Env;
}
