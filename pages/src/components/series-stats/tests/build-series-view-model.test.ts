import { describe, expect, it } from "vitest";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { buildSeriesViewModel } from "../build-series-view-model";
import { aFakeSeriesViewModelArgsWith } from "../fakes/series-view-model.fake";

describe("buildSeriesViewModel", () => {
  it("builds a match detail from a single representative match", () => {
    const [{ matchId }] = sampleLiveTrackerStateMessage.data.matchSummaries;

    const viewModel = buildSeriesViewModel(aFakeSeriesViewModelArgsWith([matchId]));

    expect(viewModel.matchSummaries).toHaveLength(1);
    expect(viewModel.matchSummaries[0]).toMatchObject({
      matchId,
      gameModeAlt: "Oddball",
      gameMap: "Streets",
    });
    expect(viewModel.matchDetails).toHaveLength(1);
    expect(viewModel.matchDetails[0]?.data?.map((team) => team.teamId)).toEqual([0, 1]);
    expect(viewModel.matchDetails[0]?.data?.flatMap((team) => team.players.length)).toEqual([4, 4]);
    expect(viewModel.seriesStats?.metadata).toMatchObject({ score: "3:2" });
  });

  it("retains chronological match summaries and detailed stats across mixed modes", () => {
    const viewModel = buildSeriesViewModel(aFakeSeriesViewModelArgsWith());

    expect(viewModel.matchSummaries.map((match) => match.gameModeAlt)).toEqual([
      "Oddball",
      "Slayer",
      "Capture the Flag",
      "King of the Hill",
      "Slayer",
    ]);
    expect(viewModel.matchSummaries.map((match) => match.matchId)).toEqual(
      sampleLiveTrackerStateMessage.data.matchSummaries.map((match) => match.matchId),
    );
    expect(viewModel.matchDetails).toHaveLength(5);
    expect(viewModel.matchDetails.every((match) => match.data != null)).toBe(true);
    expect(viewModel.seriesStats?.teamData.length).toBeGreaterThan(0);
    expect(viewModel.seriesStats?.playerData.length).toBeGreaterThan(0);
    expect(viewModel.seriesStats?.metadata).toMatchObject({ score: "3:2" });
  });
});
