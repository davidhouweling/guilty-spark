import { describe, it, expect } from "vitest";
import { ConnectSuccessEmbed } from "../connect-success-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("ConnectSuccessEmbed", () => {
  it("creates embed with correct title, description, and color", () => {
    const connectSuccessEmbed = new ConnectSuccessEmbed();

    const embed = connectSuccessEmbed.getEmbed();

    expect(embed.title).toBe("Discord account connected to Halo");
    expect(embed.description).toBe("Your Discord account has been successfully connected to your Halo account.");
    expect(embed.color).toBe(EmbedColors.SUCCESS);
    expect(embed.fields).toBeUndefined();
  });

  it("creates embed with fields when provided", () => {
    const connectSuccessEmbed = new ConnectSuccessEmbed();
    const testFields = [
      {
        name: "Test Field",
        value: "Test Value",
      },
    ];

    const embed = connectSuccessEmbed.getEmbed(testFields);

    expect(embed.title).toBe("Discord account connected to Halo");
    expect(embed.description).toBe("Your Discord account has been successfully connected to your Halo account.");
    expect(embed.color).toBe(EmbedColors.SUCCESS);
    expect(embed.fields).toEqual(testFields);
  });

  it("creates embed without fields when empty array is provided", () => {
    const connectSuccessEmbed = new ConnectSuccessEmbed();

    const embed = connectSuccessEmbed.getEmbed([]);

    expect(embed.title).toBe("Discord account connected to Halo");
    expect(embed.description).toBe("Your Discord account has been successfully connected to your Halo account.");
    expect(embed.color).toBe(EmbedColors.SUCCESS);
    expect(embed.fields).toBeUndefined();
  });
});
