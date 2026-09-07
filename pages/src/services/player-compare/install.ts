import { getMode } from "../mode";
import { RealPlayerCompareService } from "./player-compare";
import type { PlayerCompareService } from "./player-compare-types";

export async function installPlayerCompareService(apiHost: string): Promise<PlayerCompareService> {
  if (getMode() === "FAKE") {
    const { aFakePlayerCompareServiceWith } = await import("./fakes/player-compare.fake");
    return aFakePlayerCompareServiceWith();
  }

  return new RealPlayerCompareService({ apiHost });
}
