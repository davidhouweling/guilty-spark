import { getMode } from "../../mode";
import { RealMatchDetailsService } from "./match-details";
import type { MatchDetailsService } from "./types";

export async function installMatchDetailsService(apiHost: string): Promise<MatchDetailsService> {
  if (getMode() === "FAKE") {
    const { aFakeMatchDetailsServiceWith } = await import("./fakes/match-details.fake");
    return aFakeMatchDetailsServiceWith();
  }

  return new RealMatchDetailsService({ apiHost });
}
