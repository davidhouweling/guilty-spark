import { describe, expect, it } from "vitest";
import { SetupNeatQueueInformerEmbed } from "../setup-neatqueue-informer-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("SetupNeatQueueInformerEmbed", () => {
  it("creates embed with description and config display", () => {
    const description = [
      "This feature works in conjunction with NeatQueue integration.",
      "",
      "To enable this feature:",
      '1. Give "Guilty Spark" a role',
      "2. Run the two commands",
    ].join("\n");
    const configDisplay = [
      "**Player Connections on queue start:** Enabled",
      "**Live Tracking:** Enabled (with channel name updates)",
      "**Maps on queue start:** Enabled, HCS, 5 maps",
    ].join("\n");

    const embed = new SetupNeatQueueInformerEmbed({ description, configDisplay });

    const result = embed.embed;

    expect(result.title).toBe("NeatQueue Informer");
    expect(result.description).toBe(description);
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toHaveLength(1);
    expect(result.fields?.[0]?.name).toBe("");
    expect(result.fields?.[0]?.value).toBe(configDisplay);
  });

  it("creates embed with simple configuration", () => {
    const description = "Simple description";
    const configDisplay = "**Setting:** Disabled";

    const embed = new SetupNeatQueueInformerEmbed({ description, configDisplay });

    const result = embed.embed;

    expect(result.description).toBe(description);
    expect(result.fields?.[0]?.value).toBe(configDisplay);
  });

  it("creates embed with multi-line description", () => {
    const description = ["Line 1", "Line 2", "Line 3"].join("\n");
    const configDisplay = "Config value";

    const embed = new SetupNeatQueueInformerEmbed({ description, configDisplay });

    const result = embed.embed;

    expect(result.description).toContain("Line 1");
    expect(result.description).toContain("Line 3");
  });
});
