import { describe, expect, it } from "vitest";
import { LiveTrackerLoadingEmbed } from "../live-tracker-loading-embed.mjs";

describe("LiveTrackerLoadingEmbed", () => {
  it("returns loading embed with starting message", () => {
    const embed = new LiveTrackerLoadingEmbed();

    expect(embed.embed).toMatchObject({
      title: "🔄 Starting Live Tracker",
      description: "Setting up live tracking for your NeatQueue series...",
    });
  });

  it("returns embed with info color", () => {
    const embed = new LiveTrackerLoadingEmbed();

    expect(embed.embed.color).toBeDefined();
  });

  it("returns consistent embed on multiple calls", () => {
    const embed = new LiveTrackerLoadingEmbed();

    const result1 = embed.embed;
    const result2 = embed.embed;

    expect(result1).toEqual(result2);
  });
});
