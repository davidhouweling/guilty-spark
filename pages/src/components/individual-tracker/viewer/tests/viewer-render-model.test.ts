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

  it("keeps Unknown outcome neutral with no colour", () => {
    expect.assertions(2);
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1", outcome: "Unknown" })],
    });

    const model = buildViewerRenderModel({ view });

    const [first] = model.timeline;
    if (first.type === "match") {
      expect(first.match.outcome).toBe("Unknown");
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

  it("passes statsHighlights from the view state through to the render model", () => {
    const view = aFakeTrackerViewStateWith({
      statsHighlights: [{ label: "KDA", value: "3.2" }],
    });

    const model = buildViewerRenderModel({ view });

    expect(model.statsHighlights).toEqual([{ label: "KDA", value: "3.2" }]);
  });

  it("passes undefined statsHighlights when absent from the view state", () => {
    const view = aFakeTrackerViewStateWith();

    const model = buildViewerRenderModel({ view });

    expect(model.statsHighlights).toBeUndefined();
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

  it("uses series summary stats from the series payload", () => {
    expect.assertions(2);
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({
          matchId: "m1",
          killsDeathsAssistsKda: "11:8:4 (1.54)",
          damageDealtTakenRatio: "4,400:3,900 (1.13)",
        }),
        aFakeTrackerMatchSummaryWith({
          matchId: "m2",
          killsDeathsAssistsKda: "9:7:5 (1.52)",
          damageDealtTakenRatio: "3,800:3,600 (1.06)",
        }),
      ],
      series: [
        aFakeTrackerSeriesGroupWith({
          id: "s1",
          matchIds: ["m1", "m2"],
          killsDeathsAssistsKda: "20:15:9 (1.53)",
          damageDealtTakenRatio: "8,200:7,500 (1.09)",
        }),
      ],
    });

    const model = buildViewerRenderModel({ view });
    const [first] = model.timeline;
    if (first.type === "series") {
      expect(first.series.killsDeathsAssistsKda).toBe("20:15:9 (1.53)");
      expect(first.series.damageDealtTakenRatio).toBe("8,200:7,500 (1.09)");
    }
  });

  it("marks only the most recent timeline series active when active context is missing", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [
        aFakeTrackerMatchSummaryWith({ matchId: "m1" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m2" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m3" }),
        aFakeTrackerMatchSummaryWith({ matchId: "m4" }),
      ],
      series: [
        aFakeTrackerSeriesGroupWith({ id: "series-older", matchIds: ["m1", "m2"] }),
        aFakeTrackerSeriesGroupWith({ id: "series-recent", matchIds: ["m3", "m4"] }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: undefined,
    });

    const model = buildViewerRenderModel({ view });
    const seriesItems = model.timeline.filter((item) => item.type === "series");

    expect(seriesItems).toHaveLength(2);
    expect(seriesItems.find((item) => item.series.id === "series-older")?.series.isActive).toBe(false);
    expect(seriesItems.find((item) => item.series.id === "series-recent")?.series.isActive).toBe(true);
  });

  it("maps active series context teams onto the active series tab", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [
        aFakeTrackerSeriesGroupWith({
          id: "series-1",
          title: "Alpha vs Beta",
          subtitle: "Bo3",
          matchIds: ["m1", "m2"],
        }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: "Bo3",
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: null, discordName: "A-Discord", gamertag: "A-Xbox", xboxId: null }],
          },
          {
            id: 1,
            name: "Beta",
            players: [{ discordId: null, discordName: null, gamertag: "B-Xbox", xboxId: null }],
          },
        ],
      },
    });

    const model = buildViewerRenderModel({ view });
    const seriesItem = model.timeline.find((item) => item.type === "series");

    expect(seriesItem?.type).toBe("series");
    if (seriesItem?.type === "series") {
      expect(seriesItem.series.teams).toHaveLength(2);
      expect(seriesItem.series.teams[0]?.name).toBe("Alpha");
      expect(seriesItem.series.teams[0]?.players[0]?.discordName).toBe("A-Discord");
      expect(seriesItem.series.teams[1]?.players[0]?.gamertag).toBe("B-Xbox");
    }
  });

  it("maps active series teams when active context subtitle is missing but title uniquely matches", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [
        aFakeTrackerSeriesGroupWith({
          id: "series-1",
          title: "Alpha vs Beta",
          subtitle: "Bo3",
          matchIds: ["m1", "m2"],
        }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: null,
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [{ discordId: null, discordName: "A-Discord", gamertag: "A-Xbox", xboxId: null }],
          },
          {
            id: 1,
            name: "Beta",
            players: [{ discordId: null, discordName: null, gamertag: "B-Xbox", xboxId: null }],
          },
        ],
      },
    });

    const model = buildViewerRenderModel({ view });
    const seriesItem = model.timeline.find((item) => item.type === "series");

    expect(seriesItem?.type).toBe("series");
    if (seriesItem?.type === "series") {
      expect(seriesItem.series.isActive).toBe(true);
      expect(seriesItem.series.teams).toHaveLength(2);
      expect(seriesItem.series.teams[0]?.name).toBe("Alpha");
      expect(seriesItem.series.teams[1]?.name).toBe("Beta");
    }
  });

  it("maps guild icon url onto active series context and series timeline items", () => {
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [
        aFakeTrackerSeriesGroupWith({
          id: "series-1",
          title: "Alpha vs Beta",
          subtitle: "Bo3",
          guildIconUrl: "https://cdn.example.com/series-icon.png",
          matchIds: ["m1", "m2"],
        }),
      ],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: "Alpha vs Beta",
        subtitle: "Bo3",
        guildIconUrl: "https://cdn.example.com/context-icon.png",
        teams: [],
      },
    });

    const model = buildViewerRenderModel({ view });
    const seriesItem = model.timeline.find((item) => item.type === "series");

    expect(model.activeSeriesContext?.guildIconUrl).toBe("https://cdn.example.com/context-icon.png");
    expect(seriesItem?.type).toBe("series");
    if (seriesItem?.type === "series") {
      expect(seriesItem.series.guildIconUrl).toBe("https://cdn.example.com/series-icon.png");
    }
  });
});
