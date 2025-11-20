import { describe, expect, it } from "vitest";
import { SetupConfigEmbed } from "../setup-config-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("SetupConfigEmbed", () => {
  it("creates embed with configuration display", () => {
    const configDisplay = [
      "**Stats Display:** Series Only",
      "**NeatQueue Integration:** Enabled",
      "**NeatQueue Informer:** Player connections enabled",
    ].join("\n");

    const embed = new SetupConfigEmbed({ configDisplay });

    const result = embed.embed;

    expect(result.title).toBe("Server Configuration");
    expect(result.description).toBe("Current configuration for your server:");
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toHaveLength(1);
    expect(result.fields?.[0]?.name).toBe("");
    expect(result.fields?.[0]?.value).toBe(configDisplay);
  });

  it("creates embed with simple config", () => {
    const configDisplay = "**Stats Display:** Series + All Game Stats";

    const embed = new SetupConfigEmbed({ configDisplay });

    const result = embed.embed;

    expect(result.fields).toHaveLength(1);
    expect(result.fields?.[0]?.value).toBe(configDisplay);
  });

  it("creates embed with multi-line config", () => {
    const configDisplay = ["Line 1", "Line 2", "Line 3", "Line 4"].join("\n");

    const embed = new SetupConfigEmbed({ configDisplay });

    const result = embed.embed;

    expect(result.fields?.[0]?.value).toContain("Line 1");
    expect(result.fields?.[0]?.value).toContain("Line 4");
  });
});
