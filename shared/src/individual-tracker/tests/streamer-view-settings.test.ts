import { describe, expect, it } from "vitest";
import { parseStreamerViewSettings } from "../streamer-view-settings";

describe("parseStreamerViewSettings", () => {
  it("returns valid settings for a well-formed JSON string", () => {
    const json = JSON.stringify({
      styleFlags: { teamColor: "#ff0000", enemyColor: "#0000ff" },
      visibleSections: { showTicker: true, showScore: false },
      layoutOptions: { viewMode: "wide", fontSizes: { score: 24 } },
    });

    const result = parseStreamerViewSettings(json);

    expect(result.styleFlags?.teamColor).toBe("#ff0000");
    expect(result.styleFlags?.enemyColor).toBe("#0000ff");
    expect(result.visibleSections?.showTicker).toBe(true);
    expect(result.visibleSections?.showScore).toBe(false);
    expect(result.layoutOptions?.viewMode).toBe("wide");
    expect(result.layoutOptions?.fontSizes?.score).toBe(24);
  });

  it("returns empty object for invalid JSON", () => {
    const result = parseStreamerViewSettings("not valid json {{{");

    expect(result).toEqual({});
  });

  it("returns empty object for an empty JSON object", () => {
    const result = parseStreamerViewSettings("{}");

    expect(result).toEqual({});
  });

  it("returns empty object when settings schema validation fails", () => {
    const json = JSON.stringify({ styleFlags: { teamColor: 12345 } });

    const result = parseStreamerViewSettings(json);

    expect(result).toEqual({});
  });

  it("handles partial settings with missing optional fields", () => {
    const json = JSON.stringify({ styleFlags: { teamColor: "#aabbcc" } });

    const result = parseStreamerViewSettings(json);

    expect(result.styleFlags?.teamColor).toBe("#aabbcc");
    expect(result.visibleSections).toBeUndefined();
    expect(result.layoutOptions).toBeUndefined();
  });

  it("handles unknown extra fields by stripping them", () => {
    const json = JSON.stringify({ styleFlags: { teamColor: "#ff0000", unknownField: true } });

    const result = parseStreamerViewSettings(json);

    expect(result.styleFlags?.teamColor).toBe("#ff0000");
  });
});
