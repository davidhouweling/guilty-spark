import { describe, expect, it } from "vitest";
import { parseSettingsFromUrl, encodeSettingsToUrlParams } from "../settings-url-params";
import { DEFAULT_ALL_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import type { AllStreamerSettings } from "../types";

describe("parseSettingsFromUrl", () => {
  it("returns default settings when no URL params are present", () => {
    const result = parseSettingsFromUrl(new URLSearchParams());

    expect(result).toEqual(DEFAULT_ALL_SETTINGS);
  });

  it("returns provided defaults when no URL params are present", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        colors: {
          ...DEFAULT_GLOBAL_SETTINGS.colors,
          mode: "player",
          observerView: {
            eagleColor: "red",
            cobraColor: "blue",
          },
        },
        ticker: {
          ...DEFAULT_GLOBAL_SETTINGS.ticker,
          showTicker: false,
        },
      },
    };

    const result = parseSettingsFromUrl(new URLSearchParams(), customDefaults);

    expect(result).toEqual(customDefaults);
  });

  it("overrides defaults with URL params when both are present", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        colors: {
          ...DEFAULT_GLOBAL_SETTINGS.colors,
          mode: "player",
          observerView: {
            eagleColor: "stored-eagle",
            cobraColor: "stored-cobra",
          },
        },
      },
    };

    const params = new URLSearchParams();
    params.set("eagleColor", "url-eagle");
    params.set("cobraColor", "url-cobra");

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.colors.observerView.eagleColor).toBe("url-eagle");
    expect(result.global.colors.observerView.cobraColor).toBe("url-cobra");
  });

  it("preserves non-overridden defaults when URL only has some params", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        colors: {
          ...DEFAULT_GLOBAL_SETTINGS.colors,
          mode: "player",
          observerView: {
            eagleColor: "stored-eagle",
            cobraColor: "stored-cobra",
          },
        },
        ticker: {
          ...DEFAULT_GLOBAL_SETTINGS.ticker,
          showTicker: false,
          showTabs: false,
        },
      },
    };

    const params = new URLSearchParams();
    params.set("eagleColor", "url-eagle");
    // cobraColor is NOT set - should fall back to stored value

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.colors.observerView.eagleColor).toBe("url-eagle");
    expect(result.global.colors.observerView.cobraColor).toBe("stored-cobra");
    // ticker settings not in URL - should use stored defaults
    expect(result.global.ticker.showTicker).toBe(false);
    expect(result.global.ticker.showTabs).toBe(false);
  });

  it("parses viewMode from URL and overrides default", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        viewMode: "standard",
      },
    };

    const params = new URLSearchParams();
    params.set("viewMode", "wide");

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.viewMode).toBe("wide");
  });

  it("falls back to provided default viewMode when viewMode is not in URL", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        viewMode: "streamer",
      },
    };

    const result = parseSettingsFromUrl(new URLSearchParams(), customDefaults);

    expect(result.global.viewMode).toBe("streamer");
  });

  it("parses colorMode from URL", () => {
    const params = new URLSearchParams();
    params.set("colorMode", "player");

    const result = parseSettingsFromUrl(params);

    expect(result.global.colors.mode).toBe("player");
  });

  it("preserves stored colorMode when colorMode is not in URL", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        colors: {
          ...DEFAULT_GLOBAL_SETTINGS.colors,
          mode: "player",
        },
      },
    };

    const result = parseSettingsFromUrl(new URLSearchParams(), customDefaults);

    expect(result.global.colors.mode).toBe("player");
  });

  it("parses display settings from URL and merges with defaults", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        display: {
          ...DEFAULT_GLOBAL_SETTINGS.display,
          showDiscordNames: false,
          showXboxNames: false,
        },
      },
    };

    const params = new URLSearchParams();
    params.set("showTitle", "false");
    // showDiscordNames and showXboxNames not in URL - should preserve stored values

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.display.showTitle).toBe(false);
    expect(result.global.display.showDiscordNames).toBe(false);
    expect(result.global.display.showXboxNames).toBe(false);
  });

  it("parses ticker settings from URL and merges with defaults", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        ticker: {
          ...DEFAULT_GLOBAL_SETTINGS.ticker,
          showTicker: false,
        },
      },
    };

    const params = new URLSearchParams();
    params.set("showTabs", "false");
    // showTicker not in URL - should preserve stored value (false)

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.ticker.showTabs).toBe(false);
    expect(result.global.ticker.showTicker).toBe(false);
  });

  it("parses font sizes from URL and merges with stored values", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        fontSizes: {
          ...DEFAULT_GLOBAL_SETTINGS.fontSizes,
          queueInfo: 120,
          ticker: 80,
        },
      },
    };

    const params = new URLSearchParams();
    params.set("fontSize_queueInfo", "110");
    // fontSize_ticker not in URL - should use stored value

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.global.fontSizes.queueInfo).toBe(110);
    expect(result.global.fontSizes.ticker).toBe(80);
  });

  it("parses series settings from URL", () => {
    const params = new URLSearchParams();
    params.set("title", "My Series");
    params.set("eagleTeamName", "Eagle Squad");

    const result = parseSettingsFromUrl(params);

    expect(result.series.titleOverride).toBe("My Series");
    expect(result.series.eagleTeamNameOverride).toBe("Eagle Squad");
  });

  it("preserves stored series settings when series params not in URL", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      series: {
        ...DEFAULT_ALL_SETTINGS.series,
        titleOverride: "Stored Title",
        eagleTeamNameOverride: "Stored Eagle",
      },
    };

    const result = parseSettingsFromUrl(new URLSearchParams(), customDefaults);

    expect(result.series.titleOverride).toBe("Stored Title");
    expect(result.series.eagleTeamNameOverride).toBe("Stored Eagle");
  });

  it("URL params take priority over stored series settings", () => {
    const customDefaults: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      series: {
        ...DEFAULT_ALL_SETTINGS.series,
        titleOverride: "Stored Title",
      },
    };

    const params = new URLSearchParams();
    params.set("title", "URL Title");

    const result = parseSettingsFromUrl(params, customDefaults);

    expect(result.series.titleOverride).toBe("URL Title");
  });
});

describe("encodeSettingsToUrlParams", () => {
  it("encodes and can be round-tripped with parseSettingsFromUrl", () => {
    const original: AllStreamerSettings = {
      ...DEFAULT_ALL_SETTINGS,
      global: {
        ...DEFAULT_GLOBAL_SETTINGS,
        viewMode: "wide",
        colors: {
          ...DEFAULT_GLOBAL_SETTINGS.colors,
          mode: "player",
          observerView: {
            eagleColor: "purple",
            cobraColor: "green",
          },
        },
        ticker: {
          ...DEFAULT_GLOBAL_SETTINGS.ticker,
          showTicker: false,
          showTabs: false,
        },
      },
      series: {
        ...DEFAULT_ALL_SETTINGS.series,
        titleOverride: "Test Series",
      },
    };

    const params = encodeSettingsToUrlParams(original);
    const urlSearchParams = new URLSearchParams(params);
    urlSearchParams.set("viewMode", original.global.viewMode);

    const roundTripped = parseSettingsFromUrl(urlSearchParams);

    expect(roundTripped.global.colors.mode).toBe(original.global.colors.mode);
    expect(roundTripped.global.colors.observerView.eagleColor).toBe(original.global.colors.observerView.eagleColor);
    expect(roundTripped.global.colors.observerView.cobraColor).toBe(original.global.colors.observerView.cobraColor);
    expect(roundTripped.global.ticker.showTicker).toBe(original.global.ticker.showTicker);
    expect(roundTripped.global.ticker.showTabs).toBe(original.global.ticker.showTabs);
    expect(roundTripped.series.titleOverride).toBe(original.series.titleOverride);
  });
});
