import type { RoutesRegisterHandler } from "../base/types";
import { trackerFollowRoutesRegisterHandler } from "./follow";
import { trackerManageRoutesRegisterHandler } from "./manage";
import { trackerProfileRoutesRegisterHandler } from "./profile";
import { trackerSettingsRoutesRegisterHandler } from "./settings";
import { trackerViewRoutesRegisterHandler } from "./view";

export const individualTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  trackerProfileRoutesRegisterHandler(router, installServices);
  trackerManageRoutesRegisterHandler(router, installServices);
  trackerSettingsRoutesRegisterHandler(router, installServices);
  trackerViewRoutesRegisterHandler(router, installServices);
  trackerFollowRoutesRegisterHandler(router, installServices);
};
