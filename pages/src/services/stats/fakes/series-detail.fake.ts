import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import type { SeriesDetailService } from "../detail-types";

interface FakeSeriesDetailServiceOptions {
  readonly response?: SeriesDetailResponse | undefined;
}

export class FakeSeriesDetailService implements SeriesDetailService {
  private readonly response: SeriesDetailResponse | undefined;

  constructor({ response }: FakeSeriesDetailServiceOptions = {}) {
    this.response = response;
  }

  async getSeriesDetail(seriesId: string, matchIds: readonly string[]): Promise<SeriesDetailResponse> {
    if (this.response != null) {
      return await Promise.resolve(this.response);
    }

    return await Promise.resolve(
      seriesDetailContract.parse(
        aFakeSeriesDetailResponseWith({
          seriesId,
          matches: {
            matchIds: [...matchIds],
            results: matchIds.map((matchId) => {
              const detail = aFakeMatchDetailWith({ matchId });
              return { status: "resolved", matchId, detail };
            }),
          },
        }),
      ),
    );
  }
}

export function aFakeSeriesDetailServiceWith(options: FakeSeriesDetailServiceOptions = {}): FakeSeriesDetailService {
  return new FakeSeriesDetailService(options);
}
