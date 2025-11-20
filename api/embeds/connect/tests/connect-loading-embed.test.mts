import { describe, expect, it } from "vitest";
import { ConnectLoadingEmbed } from "../connect-loading-embed.mjs";
import { EmbedColors } from "../../colors.mjs";

describe("ConnectLoadingEmbed", () => {
  it("creates embed with loading message", () => {
    const embed = new ConnectLoadingEmbed();

    const result = embed.getEmbed();

    expect(result.title).toBe("Gamertag search...");
    expect(result.description).toBe("Searching for your gamertag and recent game history...");
    expect(result.color).toBe(EmbedColors.NEUTRAL);
    expect(result.fields).toBeUndefined();
  });
});
