import { getMode } from "../mode";
import { RealCondensedMatchHistoryService } from "./condensed-match-history";
import type { CondensedMatchHistoryService } from "./condensed-match-history-types";

export async function installCondensedMatchHistoryService(apiHost: string): Promise<CondensedMatchHistoryService> {
  if (getMode() === "FAKE") {
    const { aFakeCondensedMatchHistoryServiceWith } = await import("./fakes/condensed-match-history.fake");
    return aFakeCondensedMatchHistoryServiceWith();
  }
  return new RealCondensedMatchHistoryService({ apiHost });
}
