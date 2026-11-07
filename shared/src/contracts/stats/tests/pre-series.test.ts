import { describe, expect, it } from "vitest";
import { livePreSeriesContract } from "../pre-series";
import { aFakeLivePreSeriesPlayerWith, aFakeLivePreSeriesResponseWith } from "../fakes/pre-series.fake";

describe("live pre-series contract", () => {
  it("preserves captured fields and explicit missing values with no-store", async () => {
    const data = aFakeLivePreSeriesResponseWith({
      players: [aFakeLivePreSeriesPlayerWith(), aFakeLivePreSeriesPlayerWith({ playerId: "missing", captured: null })],
    });
    const response = livePreSeriesContract.toResponse(data, { noStore: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await livePreSeriesContract.fromResponse(response)).toEqual(data);
  });

  it("strips raw data and tokens from both the envelope and captured players", () => {
    const player = aFakeLivePreSeriesPlayerWith();
    const parsed = livePreSeriesContract.parse({
      ...aFakeLivePreSeriesResponseWith(),
      rawMatches: { secret: true },
      token: "private",
      players: [{ ...player, captured: { ...player.captured, rawMatch: {}, token: "private" } }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/rawMatch|token|private/);
  });
});
