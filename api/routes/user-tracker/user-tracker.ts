import type { RoutesRegisterHandler } from "../base/types";
import { userTrackerFollowRoutesRegisterHandler } from "./follow";

export const userTrackerRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  userTrackerFollowRoutesRegisterHandler(router, installServices);
};
