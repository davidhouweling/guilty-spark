import { describe, expect, it } from "vitest";
import { SetupStatsDisplayModeEmbed } from "../setup-stats-display-mode-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("SetupStatsDisplayModeEmbed", () => {
  it("creates embed with stats display mode information", () => {
    const embed = new SetupStatsDisplayModeEmbed();

    const result = embed.embed;

    expect(result.title).toBe("Stats Display Mode");
    expect(result.description).toBe(
      "How stats are displayed when either the `/stats` command is used, or when automatically posting stats for NeatQueue.",
    );
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toBeUndefined();
  });
});
