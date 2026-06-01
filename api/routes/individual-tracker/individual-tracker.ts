import type { RoutesRegisterHandler } from "../base/types";
import { trackerManageRoutesRegisterHandler } from "./manage";
import { trackerProfileRoutesRegisterHandler } from "./profile";
import { trackerViewRoutesRegisterHandler } from "./view";

export const individualTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  trackerProfileRoutesRegisterHandler(router, installServices);
  trackerManageRoutesRegisterHandler(router, installServices);
  trackerViewRoutesRegisterHandler(router, installServices);
};
