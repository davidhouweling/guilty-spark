import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { describe, expect, it } from "vitest";
import { isMatchStats } from "../../../../controllers/stats/is-match-stats";
import { aFakeDiscordSeriesStatsDetailResultWith, aFakeDiscordSeriesStatsServiceWith } from "../discord-series.fake";

describe("FakeDiscordSeriesStatsService", () => {
  it("returns a valid default detail contract", async () => {
    const service = aFakeDiscordSeriesStatsServiceWith();

    const result = await service.getDetail();

    expect(result.status).toBe(200);
    expect(result.retryAfterSeconds).toBeNull();
    expect(seriesDetailContract.safeParse(result.data).success).toBe(true);
  });

  it("returns an overrideable detail result without changing stats or lookup", async () => {
    const detailResult = aFakeDiscordSeriesStatsDetailResultWith({
      status: 503,
      data: { status: "pending-index", guildId: "123", queueNumber: 7777, retryAfterSeconds: 3 },
      retryAfterSeconds: 7,
    });
    const service = aFakeDiscordSeriesStatsServiceWith({ detailResult });

    await expect(service.getDetail()).resolves.toEqual(detailResult);
    expect((await service.getStats()).status).toBe(200);
    expect((await service.getLookup()).status).toBe(200);
  });

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
