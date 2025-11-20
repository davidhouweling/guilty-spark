import { describe, expect, it } from "vitest";
import { SetupNeatQueueMapsConfigEmbed } from "../setup-neatqueue-maps-config-embed.mjs";

describe("SetupNeatQueueMapsConfigEmbed", () => {
  it("returns embed with maps configuration display", () => {
    const embed = new SetupNeatQueueMapsConfigEmbed({
      configDisplay: "**Trigger:** Auto\n**Playlist:** HCS Current\n**Format:** HCS\n**Count:** 5",
    });

    expect(embed.embed).toMatchObject({
      title: "NeatQueue Informer Maps Configuration",
      fields: [
        {
          name: "",
          value: "**Trigger:** Auto\n**Playlist:** HCS Current\n**Format:** HCS\n**Count:** 5",
        },
      ],
    });
  });

  it("returns embed with button trigger configuration", () => {
    const embed = new SetupNeatQueueMapsConfigEmbed({
      configDisplay: "**Trigger:** Button\n**Playlist:** HCS Historical\n**Format:** Random\n**Count:** 7",
    });

    expect(embed.embed.fields?.[0]?.value).toContain("Button");
    expect(embed.embed.fields?.[0]?.value).toContain("HCS Historical");
    expect(embed.embed.fields?.[0]?.value).toContain("Random");
    expect(embed.embed.fields?.[0]?.value).toContain("7");
  });

  it("returns embed with off trigger configuration", () => {
    const embed = new SetupNeatQueueMapsConfigEmbed({
      configDisplay: "**Trigger:** Off\n**Playlist:** HCS Current\n**Format:** Random Objective\n**Count:** 3",
    });

    expect(embed.embed).toMatchObject({
      title: "NeatQueue Informer Maps Configuration",
      description: "",
    });
    expect(embed.embed.fields).toHaveLength(1);
  });
});
