import { describe, expect, it } from "vitest";
import { SetupLiveTrackingConfigEmbed } from "../setup-live-tracking-config-embed";

describe("SetupLiveTrackingConfigEmbed", () => {
  it("returns embed with live tracking enabled config", () => {
    const embed = new SetupLiveTrackingConfigEmbed({
      configDisplay: "**Live Tracking:** Enabled ✅\n**Channel Name Updates:** Enabled ✅",
    });

    expect(embed.embed).toMatchObject({
      title: "Live Tracking Configuration",
      description: expect.stringContaining("Configure live tracking features for NeatQueue series") as string,
      fields: [
        {
          name: "Current Configuration",
          value: "**Live Tracking:** Enabled ✅\n**Channel Name Updates:** Enabled ✅",
        },
      ],
    });
  });

  it("returns embed with live tracking disabled config", () => {
    const embed = new SetupLiveTrackingConfigEmbed({
      configDisplay: "**Live Tracking:** Disabled ❌\n**Channel Name Updates:** Disabled ❌",
    });

    expect(embed.embed.fields?.[0]?.value).toBe(
      "**Live Tracking:** Disabled ❌\n**Channel Name Updates:** Disabled ❌",
    );
  });

  it("returns embed with instructions about channel name updates", () => {
    const embed = new SetupLiveTrackingConfigEmbed({
      configDisplay: "**Live Tracking:** Enabled ✅\n**Channel Name Updates:** Disabled ❌",
    });

    expect(embed.embed.description).toContain("Channel Name Updates:");
    expect(embed.embed.description).toContain("#queue-343 (🦅 2:1 🐍)");
    expect(embed.embed.description).toContain("Manage Channels");
    expect(embed.embed.description).toContain("/tempchannels permissions set");
  });
});
