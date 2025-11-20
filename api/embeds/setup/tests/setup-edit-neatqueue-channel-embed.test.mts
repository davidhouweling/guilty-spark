import { describe, expect, it } from "vitest";
import { SetupEditNeatQueueChannelEmbed } from "../setup-edit-neatqueue-channel-embed.mjs";

describe("SetupEditNeatQueueChannelEmbed", () => {
  it("returns embed with channel reference in title", () => {
    const embed = new SetupEditNeatQueueChannelEmbed({
      channelId: "123456789",
      description: "Select an option to edit the NeatQueue integration.",
    });

    expect(embed.embed).toMatchObject({
      title: "Edit NeatQueue Integration for <#123456789>",
      description: "Select an option to edit the NeatQueue integration.",
    });
  });

  it("returns embed with success message", () => {
    const embed = new SetupEditNeatQueueChannelEmbed({
      channelId: "987654321",
      description:
        "**✅ Polling interval updated successfully**\n\nSelect an option to edit the NeatQueue integration.",
    });

    expect(embed.embed).toMatchObject({
      title: "Edit NeatQueue Integration for <#987654321>",
      description:
        "**✅ Polling interval updated successfully**\n\nSelect an option to edit the NeatQueue integration.",
    });
  });

  it("returns embed with configuration display", () => {
    const embed = new SetupEditNeatQueueChannelEmbed({
      channelId: "111222333",
      description:
        "**Current Configuration:**\n- Informer Role: <@&456789>\n- Polling Interval: 60s\n\nSelect an option to edit the NeatQueue integration.",
    });

    expect(embed.embed.title).toBe("Edit NeatQueue Integration for <#111222333>");
    expect(embed.embed.description).toContain("Current Configuration");
    expect(embed.embed.description).toContain("<@&456789>");
  });
});
