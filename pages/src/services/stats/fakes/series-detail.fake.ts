import { seriesDetailContract, seriesDetailRequestSchema } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesDetailResponse, SeriesTeamMappingMode } from "@guilty-spark/shared/contracts/stats/detail";
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

  async getSeriesDetail(
    seriesId: string,
    matchIds: readonly string[],
    _trackerId?: string,
    teamMappingMode?: SeriesTeamMappingMode,
  ): Promise<SeriesDetailResponse> {
    const request = seriesDetailRequestSchema.parse({ matchIds, teamMappingMode });
    if (this.response != null) {
      return await Promise.resolve(this.response);
    }

    return await Promise.resolve(
      seriesDetailContract.parse(
        aFakeSeriesDetailResponseWith({
          seriesId,
          matches: {
            matchIds: request.matchIds,
            results: request.matchIds.map((matchId) => {
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
