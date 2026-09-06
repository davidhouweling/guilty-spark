import type { Services } from "../../services/install";
import type { ApiRouter } from "../../base/router";

export type RoutesRegisterHandler = (
  router: ApiRouter,
  installServices: ({ env }: { env: Env }) => Services,
) => void;
