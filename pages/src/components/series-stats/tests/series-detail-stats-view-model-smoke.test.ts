import { describe, expect, it } from "vitest";
import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { SeriesDetailStatsViewModelPresenter } from "../series-detail-stats-view-model-presenter";

describe("SeriesDetailStatsViewModelPresenter", () => {
  it("uses series context labels", () => {
    const response = aFakeSeriesDetailResponseWith({
      context: { title: "League", subtitle: "Queue #8" },
    });

    expect(new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(response)).toMatchObject({
      title: "League",
      subtitle: "Queue #8",
    });
  });
});
