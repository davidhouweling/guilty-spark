import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { describe, expect, it } from "vitest";
import { isMatchStats } from "../../../../controllers/stats/is-match-stats";
import { aFakeDiscordSeriesStatsServiceWith } from "../discord-series.fake";

describe("FakeDiscordSeriesStatsService", () => {
  it("returns the full shared sample series for fake stats pages", async () => {
    const service = aFakeDiscordSeriesStatsServiceWith();
    const result = await service.getStats();

    if (result.status !== 200 || result.data.status !== "resolved") {
      throw new Error("Expected fake stats to resolve with sample data");
    }

    expect(result.data.guildId).toBe(sampleLiveTrackerStateMessage.data.guildId);
    expect(result.data.queueNumber).toBe(sampleLiveTrackerStateMessage.data.queueNumber);
    expect(result.data.matchIds).toEqual(
      sampleLiveTrackerStateMessage.data.matchSummaries.map((match) => match.matchId),
    );
    expect(result.data.renderData.teams).toHaveLength(sampleLiveTrackerStateMessage.data.teams.length);
    expect(result.data.renderData.matches).toHaveLength(sampleLiveTrackerStateMessage.data.matchSummaries.length);
    expect(result.data.renderData.matches.every((match) => isMatchStats(match.rawMatch))).toBe(true);
  });
});
