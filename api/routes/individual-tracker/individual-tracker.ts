import type { RoutesRegisterHandler } from "../base/types";
import { trackerManageRoutesRegisterHandler } from "./manage";
import { trackerProfileRoutesRegisterHandler } from "./profile";
import { trackerSearchRoutesRegisterHandler } from "./search";
import { trackerSettingsRoutesRegisterHandler } from "./settings";
import { trackerViewRoutesRegisterHandler } from "./view";

export const individualTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  trackerProfileRoutesRegisterHandler(router, installServices);
  trackerManageRoutesRegisterHandler(router, installServices);
  trackerSearchRoutesRegisterHandler(router, installServices);
  trackerSettingsRoutesRegisterHandler(router, installServices);
  trackerViewRoutesRegisterHandler(router, installServices);
};
