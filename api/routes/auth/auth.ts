import type { RoutesRegisterHandler } from "../base/types";
import { authLogoutRoute } from "./logout";
import { authMicrosoftCallbackRoute } from "./microsoft/callback";
import { authMicrosoftStartRoute } from "./microsoft/start";
import { authSessionRoute } from "./session";

export const authRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  authMicrosoftStartRoute(router, installServices);
  authMicrosoftCallbackRoute(router, installServices);
  authLogoutRoute(router, installServices);
  authSessionRoute(router, installServices);
};
