import { getMode } from "../mode";
import { RealLivePreSeriesService } from "./live-pre-series";
import type { LivePreSeriesService } from "./types";

export async function installLivePreSeriesService(apiHost: string): Promise<LivePreSeriesService> {
  if (getMode() === "FAKE") {
    const { aFakeLivePreSeriesServiceWith } = await import("./fakes/live-pre-series.fake");
    return aFakeLivePreSeriesServiceWith({ status: "not-found" });
  }

  return new RealLivePreSeriesService({ apiHost });
}
