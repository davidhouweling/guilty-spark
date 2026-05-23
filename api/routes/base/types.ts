import type { AutoRouterType } from "itty-router";
import type { Services } from "../../services/install";

export type RoutesRegisterHandler = (
  router: AutoRouterType,
  installServices: ({ env }: { env: Env }) => Services,
) => void;
