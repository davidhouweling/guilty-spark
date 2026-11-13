import type { RoutesRegisterHandler } from "../base/types";
import { trackerManageRoutesRegisterHandler } from "./manage";
import { trackerOverlayPreviewRoutesRegisterHandler } from "./overlay-preview";
import { trackerProfileRoutesRegisterHandler } from "./profile";
import { trackerSearchRoutesRegisterHandler } from "./search";
import { trackerSettingsRoutesRegisterHandler } from "./settings";
import { trackerViewRoutesRegisterHandler } from "./view";
import { trackerMatchHistoryRoutesRegisterHandler } from "./match-history";

export const individualTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  trackerProfileRoutesRegisterHandler(router, installServices);
  trackerManageRoutesRegisterHandler(router, installServices);
  trackerSearchRoutesRegisterHandler(router, installServices);
  trackerMatchHistoryRoutesRegisterHandler(router, installServices);
  trackerSettingsRoutesRegisterHandler(router, installServices);
  trackerViewRoutesRegisterHandler(router, installServices);
  trackerOverlayPreviewRoutesRegisterHandler(router, installServices);
};
