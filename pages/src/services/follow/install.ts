import { getMode } from "../mode";
import { RealFollowLiveService } from "./follow";
import type { FollowLiveService } from "./follow-types";

export async function installFollowLiveService(apiHost: string): Promise<FollowLiveService> {
  if (getMode() === "FAKE") {
    const { aFakeFollowLiveServiceWith } = await import("./fakes/follow.fake");
    return aFakeFollowLiveServiceWith();
  }
  return new RealFollowLiveService({ apiHost });
}
