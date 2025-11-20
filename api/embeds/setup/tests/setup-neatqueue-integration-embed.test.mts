import { describe, expect, it } from "vitest";
import { SetupNeatQueueIntegrationEmbed } from "../setup-neatqueue-integration-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("SetupNeatQueueIntegrationEmbed", () => {
  it("creates embed with description and fields", () => {
    const description = "Configure NeatQueue integration for your server.";
    const fields = [
      {
        name: "Channel",
        value: "<#123456>",
      },
      {
        name: "Status",
        value: "Enabled",
      },
    ];

    const embed = new SetupNeatQueueIntegrationEmbed({ description, fields });

    const result = embed.embed;

    expect(result.title).toBe("NeatQueue Integration");
    expect(result.description).toBe(description);
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toEqual(fields);
    expect(result.fields).toHaveLength(2);
  });

  it("creates embed with empty fields array", () => {
    const description = "No integrations configured.";

    const embed = new SetupNeatQueueIntegrationEmbed({ description, fields: [] });

    const result = embed.embed;

    expect(result.fields).toEqual([]);
    expect(result.description).toBe(description);
  });

  it("creates embed with multiple fields", () => {
    const description = "Multiple channel integrations.";
    const fields = [
      { name: "Channel 1", value: "<#111>" },
      { name: "Channel 2", value: "<#222>" },
      { name: "Channel 3", value: "<#333>" },
    ];

    const embed = new SetupNeatQueueIntegrationEmbed({ description, fields });

    const result = embed.embed;

    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[0]?.name).toBe("Channel 1");
    expect(result.fields?.[2]?.value).toBe("<#333>");
  });
});
