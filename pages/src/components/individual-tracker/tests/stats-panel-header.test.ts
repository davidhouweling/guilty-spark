import { describe, expect, it } from "vitest";
import {
  buildMatchHeaderMetadata,
  buildMatchHeaderTitle,
  buildSeriesHeaderMetadata,
  matchHeaderBackgroundStyle,
  seriesHeaderBackgroundStyle,
} from "../stats-panel-header";
import type { ViewerMatchTab, ViewerSeriesTab } from "../viewer/types";

function aMatchWith(overrides: Partial<ViewerMatchTab> = {}): ViewerMatchTab {
  return {
    matchId: "match-1",
    mapName: "Live Fire",
    mapBackgroundUrl: "https://example.com/live-fire.jpg",
    gameVariantCategory: 6,
    isMatchmaking: false,
    gameModeName: "Slayer",
    duration: "10m",
    outcome: "Win",
    score: "50:42",
    killsDeathsAssistsKda: "10:7:4 (1.62)",
    damageDealtTakenRatio: "4,200:3,900 (1.08)",
    colorHex: undefined,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    ...overrides,
  };
}

function aSeriesWith(overrides: Partial<ViewerSeriesTab> = {}): ViewerSeriesTab {
  return {
    id: "series-1",
    title: "Eagle vs Cobra",
    subtitle: "Best of 3",
    isActive: false,
    teams: [],
    matchBackgroundUrls: [],
    score: "2:1",
    duration: "30m",
    killsDeathsAssistsKda: "20:14:9 (1.88)",
    damageDealtTakenRatio: "11,200:9,500 (1.18)",
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:30:00.000Z",
    matches: [],
    iconMatches: [],
    colorHex: undefined,
    ...overrides,
  };
}

describe("buildMatchHeaderTitle", () => {
  it("combines the game mode name and map name", () => {
    expect(buildMatchHeaderTitle(aMatchWith({ gameModeName: "Slayer", mapName: "Aquarius" }))).toBe(
      "Slayer: Aquarius",
    );
  });
});

describe("buildMatchHeaderMetadata", () => {
  it("returns score, duration, end time, KDA, and D/T in order", () => {
    const metadata = buildMatchHeaderMetadata(
      aMatchWith({
        score: "50:42",
        duration: "10m",
        endTime: "2026-01-01T00:10:00.000Z",
        killsDeathsAssistsKda: "10:7:4 (1.62)",
        damageDealtTakenRatio: "4,200:3,900 (1.08)",
      }),
    );

    expect(metadata.map((item) => item.label)).toEqual([
      "Score",
      "Duration",
      "End time",
      "Kills:Deaths:Assists (KDA)",
      "Damage D:T (D/T)",
    ]);
    expect(metadata[0]?.value).toBe("50:42");
    expect(metadata[1]?.value).toBe("10m");
    expect(metadata[3]?.value).toBe("10:7:4 (1.62)");
    expect(metadata[4]?.value).toBe("4,200:3,900 (1.08)");
  });

  it("formats a valid end time as a locale string rather than the raw ISO value", () => {
    const metadata = buildMatchHeaderMetadata(aMatchWith({ endTime: "2026-01-01T00:10:00.000Z" }));
    const endTimeItem = metadata.find((item) => item.label === "End time");

    expect(endTimeItem?.value).toBe(new Date("2026-01-01T00:10:00.000Z").toLocaleString());
  });

  it("shows unknown for an unparseable end time", () => {
    const metadata = buildMatchHeaderMetadata(aMatchWith({ endTime: "not-a-date" }));
    const endTimeItem = metadata.find((item) => item.label === "End time");

    expect(endTimeItem?.value).toBe("unknown");
  });
});

describe("buildSeriesHeaderMetadata", () => {
  it("shows end time for a completed series", () => {
    const metadata = buildSeriesHeaderMetadata(aSeriesWith({ isActive: false, endTime: "2026-01-01T00:30:00.000Z" }));

    expect(metadata.map((item) => item.label)).toEqual([
      "Score",
      "Duration",
      "End time",
      "Kills:Deaths:Assists (KDA)",
      "Damage D:T (D/T)",
    ]);
  });

  it("shows start time instead of end time for an active series", () => {
    const metadata = buildSeriesHeaderMetadata(
      aSeriesWith({ isActive: true, startTime: "2026-01-01T00:00:00.000Z" }),
    );

    expect(metadata.map((item) => item.label)).toEqual([
      "Score",
      "Duration",
      "Start time",
      "Kills:Deaths:Assists (KDA)",
      "Damage D:T (D/T)",
    ]);
    const startTimeItem = metadata.find((item) => item.label === "Start time");
    expect(startTimeItem?.value).toBe(new Date("2026-01-01T00:00:00.000Z").toLocaleString());
  });
});

describe("matchHeaderBackgroundStyle", () => {
  it("uses the match background url when present", () => {
    const style = matchHeaderBackgroundStyle("https://example.com/aquarius.jpg", undefined);
    expect(style).toEqual({ "--match-bg": "url(https://example.com/aquarius.jpg)" });
  });

  it("falls back to the provided thumbnail url when the background is a blank placeholder", () => {
    const style = matchHeaderBackgroundStyle("data:,", "https://example.com/fallback.jpg");
    expect(style).toEqual({ "--match-bg": "url(https://example.com/fallback.jpg)" });
  });

  it("falls back to a gradient when neither background nor fallback is usable", () => {
    const style = matchHeaderBackgroundStyle("", undefined);
    expect(style).toEqual({ "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)" });
  });
});

describe("seriesHeaderBackgroundStyle", () => {
  it("returns a gradient when there are no usable backgrounds", () => {
    const style = seriesHeaderBackgroundStyle([], 0, false, false);
    expect(style).toEqual({ "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)" });
  });

  it("cycles through backgrounds based on the rotation tick, filtering blank placeholders", () => {
    const backgrounds = ["data:,", "https://example.com/a.jpg", "https://example.com/b.jpg"];

    const first = seriesHeaderBackgroundStyle(backgrounds, 0, false, false);
    expect(first).toEqual({
      "--match-bg": "url(https://example.com/a.jpg)",
      "--match-bg-next": "url(https://example.com/a.jpg)",
      "--match-bg-next-opacity": 0,
      "--match-glitch-opacity": 0,
    });

    const second = seriesHeaderBackgroundStyle(backgrounds, 1, false, false);
    expect(second).toEqual({
      "--match-bg": "url(https://example.com/b.jpg)",
      "--match-bg-next": "url(https://example.com/b.jpg)",
      "--match-bg-next-opacity": 0,
      "--match-glitch-opacity": 0,
    });
  });

  it("shows the previous background as the base while transitioning, with the next fading in", () => {
    const backgrounds = ["https://example.com/a.jpg", "https://example.com/b.jpg"];

    const style = seriesHeaderBackgroundStyle(backgrounds, 1, true, false);

    expect(style).toEqual({
      "--match-bg": "url(https://example.com/a.jpg)",
      "--match-bg-next": "url(https://example.com/b.jpg)",
      "--match-bg-next-opacity": 1,
      "--match-glitch-opacity": 0,
    });
  });

  it("applies the glitch opacity only when glitching with more than one background", () => {
    const backgrounds = ["https://example.com/a.jpg", "https://example.com/b.jpg"];

    const glitching = seriesHeaderBackgroundStyle(backgrounds, 0, false, true);
    expect(glitching).toMatchObject({ "--match-glitch-opacity": 0.28 });

    const notGlitching = seriesHeaderBackgroundStyle(backgrounds, 0, false, false);
    expect(notGlitching).toMatchObject({ "--match-glitch-opacity": 0 });

    const singleBackgroundGlitching = seriesHeaderBackgroundStyle(["https://example.com/a.jpg"], 0, false, true);
    expect(singleBackgroundGlitching).toMatchObject({ "--match-glitch-opacity": 0 });
  });
});
