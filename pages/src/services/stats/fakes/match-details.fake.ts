import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchDetailWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import type { MatchDetailsService } from "../detail-types";

interface FakeMatchDetailsServiceOptions {
  readonly response?: MatchDetailResponse | undefined;
}

export class FakeMatchDetailsService implements MatchDetailsService {
  private readonly response: MatchDetailResponse | undefined;

  constructor({ response }: FakeMatchDetailsServiceOptions = {}) {
    this.response = response;
  }

  async getMatchDetails(matchIds: readonly string[]): Promise<MatchDetailResponse> {
    if (this.response != null) {
      return await Promise.resolve(this.response);
    }

    return await Promise.resolve(
      matchDetailContract.parse({
        matchIds: [...matchIds],
        results: matchIds.map((matchId) => {
          const detail = aFakeMatchDetailWith({ matchId });
          return { status: "resolved", matchId, detail };
        }),
      }),
    );
  }
}

export function aFakeMatchDetailsServiceWith(options: FakeMatchDetailsServiceOptions = {}): FakeMatchDetailsService {
  return new FakeMatchDetailsService(options);
}
