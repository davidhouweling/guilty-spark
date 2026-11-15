import { getMode } from "../mode";
import { RealSeriesMatchesService } from "./series-matches";
import type { SeriesMatchesService } from "./types";

export async function installSeriesMatchesService(apiHost: string): Promise<SeriesMatchesService> {
  if (getMode() === "FAKE") {
    const { aFakeSeriesMatchesServiceWith } = await import("./fakes/series-matches.fake");
    return aFakeSeriesMatchesServiceWith();
  }

  return new RealSeriesMatchesService({ apiHost });
}
