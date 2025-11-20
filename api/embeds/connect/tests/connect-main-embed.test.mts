import { describe, expect, it } from "vitest";
import { ConnectMainEmbed } from "../connect-main-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("ConnectMainEmbed", () => {
  it("creates embed with provided fields", () => {
    const fields = [
      {
        name: "What Guilty Spark knows",
        value: "**Halo account:** TestPlayer",
      },
    ];

    const embed = new ConnectMainEmbed({ fields });

    const result = embed.embed;

    expect(result.title).toBe("Connect Discord to Halo");
    expect(result.description).toContain("Connecting your Discord account to Halo account");
    expect(result.description).toContain("allows Guilty Spark to find your matches");
    expect(result.description).toContain("Click the button below to search for your gamertag");
    expect(result.color).toBe(EmbedColors.INFO);
    expect(result.fields).toEqual(fields);
  });

  it("creates embed with multiple fields", () => {
    const fields = [
      {
        name: "Field 1",
        value: "Value 1",
      },
      {
        name: "Field 2",
        value: "Value 2",
      },
    ];

    const embed = new ConnectMainEmbed({ fields });

    const result = embed.embed;

    expect(result.fields).toHaveLength(2);
    expect(result.fields).toEqual(fields);
  });

  it("creates embed with empty fields array", () => {
    const embed = new ConnectMainEmbed({ fields: [] });

    const result = embed.embed;

    expect(result.fields).toEqual([]);
    expect(result.title).toBe("Connect Discord to Halo");
  });
});
