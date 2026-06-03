import type { HaloInfiniteClient } from "halo-infinite-api";
import { aFakeMatchStatsWith } from "../../components/stats/fakes/data";

class FakeHaloClient implements Pick<HaloInfiniteClient, "getMatchStats"> {
  public async getMatchStats(matchId: string): ReturnType<HaloInfiniteClient["getMatchStats"]> {
    await Promise.resolve();
    return aFakeMatchStatsWith({ MatchId: matchId });
  }
}

export function aFakeHaloClientWith(
  overrides?: Partial<Pick<HaloInfiniteClient, "getMatchStats">>,
): HaloInfiniteClient {
  const base = new FakeHaloClient();
  return Object.assign(base, overrides) as unknown as HaloInfiniteClient;
}
