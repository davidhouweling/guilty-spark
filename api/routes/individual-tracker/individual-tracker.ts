import type { RoutesRegisterHandler } from "../base/types";
import { trackerProfileRoutesRegisterHandler } from "./profile";

export const individualTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  trackerProfileRoutesRegisterHandler(router, installServices);
};
