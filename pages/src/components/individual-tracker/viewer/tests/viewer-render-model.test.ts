import { describe, expect, it } from "vitest";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { buildViewerRenderModel } from "../viewer-render-model";

const TEAM_DEFAULT_HEX = "#FE3939";
const ENEMY_DEFAULT_HEX = "#3B9DFF";

describe("buildViewerRenderModel", () => {
  it("emits standalone match items in order with accumulated stats", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2", outcome: "Loss" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m3", outcome: "Tie" }),
      ],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.timeline).toHaveLength(3);
    expect(model.timeline.map((item) => (item.type === "match" ? item.match.matchId : item.series.id))).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(model.accumulated).toEqual({ total: 3, wins: 1, losses: 1, ties: 1 });
  });

  it("emits a series item at the anchor position without duplicating members", () => {
    expect.assertions(5);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m3" }),
      ],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "m2"] })],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.timeline).toHaveLength(2);
    const [first, second] = model.timeline;
    if (first.type === "series") {
      expect(first.series.id).toBe("s1");
      expect(first.series.matches.map((m) => m.matchId)).toEqual(["m1", "m2"]);
      expect(first.series.colorHex).toBeUndefined();
    }
    if (second.type === "match") {
      expect(second.match.matchId).toBe("m3");
    }
  });

  it("preserves series member order as listed in the series", () => {
    expect.assertions(1);
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m2", "m1"] })],
    });

    const model = buildViewerRenderModel({ view });

    const [first] = model.timeline;
    if (first.type === "series") {
      expect(first.series.matches.map((m) => m.matchId)).toEqual(["m2", "m1"]);
    }
  });

  it("derives series start and end times from the actual chronological bounds", () => {
    expect.assertions(2);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m1",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
        }),
        aFakeTrackerMatchSummaryWith({
          matchId: "m2",
          startTime: "2026-01-01T00:20:00.000Z",
          endTime: "2026-01-01T00:30:00.000Z",
        }),
      ],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m2", "m1"] })],
    });

    const model = buildViewerRenderModel({ view });

    const [first] = model.timeline;
    if (first.type === "series") {
      expect(first.series.startTime).toBe("2026-01-01T00:00:00.000Z");
      expect(first.series.endTime).toBe("2026-01-01T00:30:00.000Z");
    }
  });

  it("interleaves standalone matches and series in chronological order", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m3" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m4" }),
      ],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m2", "m3"] })],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.timeline.map((item) => (item.type === "match" ? item.match.matchId : item.series.id))).toEqual([
      "m1",
      "s1",
      "m4",
    ]);
  });

  it("maps outcomes to colours: win team, loss enemy, others neutral", () => {
    expect.assertions(5);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2", outcome: "Loss" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m3", outcome: "Tie" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m4", outcome: "DNF" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m5", outcome: "Unknown" }),
      ],
    });

    const model = buildViewerRenderModel({ view });

    for (const item of model.timeline) {
      if (item.type === "match") {
        const expected =
          item.match.matchId === "m1" ? TEAM_DEFAULT_HEX : item.match.matchId === "m2" ? ENEMY_DEFAULT_HEX : undefined;
        expect(item.match.colorHex).toBe(expected);
      }
    }
  });

  it("treats an unrecognised outcome string as unknown with no colour", () => {
    expect.assertions(2);
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1", outcome: "Bananas" })],
    });

    const model = buildViewerRenderModel({ view });

    const [first] = model.timeline;
    if (first.type === "match") {
      expect(first.match.outcome).toBe("unknown");
      expect(first.match.colorHex).toBeUndefined();
    }
  });

  it("falls back to standalone matches when a series references fewer than two known matches", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "missing"] })],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.timeline.map((item) => (item.type === "match" ? item.match.matchId : item.series.id))).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("passes topBarStats from the view state through to the render model", () => {
    const view = aFakeTrackerViewStateWith({
      topBarStats: [{ label: "KDA", value: "3.2" }],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.topBarStats).toEqual([{ label: "KDA", value: "3.2" }]);
  });

  it("passes undefined topBarStats when absent from the view state", () => {
    const view = aFakeTrackerViewStateWith();

    const model = buildViewerRenderModel({ view });

    expect(model.topBarStats).toBeUndefined();
  });

  it("flows custom preferred colour ids into the hexes", () => {
    expect.assertions(2);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2", outcome: "Loss" }),
      ],
    });

    const model = buildViewerRenderModel({
      view,
      preferredTeamColorId: "jade",
      preferredEnemyColorId: "lime",
    });

    const [win, loss] = model.timeline;
    if (win.type === "match") {
      expect(win.match.colorHex).toBe("#8AFFBE");
    }
    if (loss.type === "match") {
      expect(loss.match.colorHex).toBe("#8FED23");
    }
  });

  it("renders unknown match duration when timestamps are invalid", () => {
    expect.assertions(1);
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1", startTime: "bad-start", endTime: "bad-end" })],
    });

    const model = buildViewerRenderModel({ view });
    const [first] = model.timeline;
    if (first.type === "match") {
      expect(first.match.duration).toBe("unknown");
    }
  });

  it("renders unknown series duration when any member has invalid bounds", () => {
    expect.assertions(1);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m1",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
        }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2", startTime: "bad-start", endTime: "bad-end" }),
      ],
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "m2"] })],
    });

    const model = buildViewerRenderModel({ view });
    const [first] = model.timeline;
    if (first.type === "series") {
      expect(first.series.duration).toBe("unknown");
    }
  });
});
