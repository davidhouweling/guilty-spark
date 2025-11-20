import { describe, expect, it } from "vitest";
import { SetupEditNeatQueueEmbed } from "../setup-edit-neatqueue-embed.mjs";

describe("SetupEditNeatQueueEmbed", () => {
  it("returns embed with integration list", () => {
    const embed = new SetupEditNeatQueueEmbed({
      description: "Select the NeatQueue integration you would like to edit.",
      fields: [
        {
          name: "Existing NeatQueue Integrations",
          value: "- <#123456789> (Role: <@&987654321>)",
        },
      ],
    });

    expect(embed.embed).toMatchObject({
      title: "Edit NeatQueue Integration",
      description: "Select the NeatQueue integration you would like to edit.",
      fields: [
        {
          name: "Existing NeatQueue Integrations",
          value: "- <#123456789> (Role: <@&987654321>)",
        },
      ],
    });
  });

  it("returns embed with success message prepended", () => {
    const embed = new SetupEditNeatQueueEmbed({
      description:
        "**✅ Integration updated successfully**\n\nSelect the NeatQueue integration you would like to edit.",
      fields: [
        {
          name: "Existing NeatQueue Integrations",
          value: "- <#111111111>\n- <#222222222>",
        },
      ],
    });

    expect(embed.embed).toMatchObject({
      title: "Edit NeatQueue Integration",
      description:
        "**✅ Integration updated successfully**\n\nSelect the NeatQueue integration you would like to edit.",
    });
  });

  it("returns embed with multiple integrations", () => {
    const embed = new SetupEditNeatQueueEmbed({
      description: "Select the NeatQueue integration you would like to edit.",
      fields: [
        {
          name: "Existing NeatQueue Integrations",
          value:
            "- <#111111111> (Role: <@&123456>)\n- <#222222222> (Role: <@&789012>)\n- <#333333333> (Role: <@&345678>)",
        },
      ],
    });

    expect(embed.embed.fields).toHaveLength(1);
    expect(embed.embed.fields?.[0]?.value).toContain("<#111111111>");
    expect(embed.embed.fields?.[0]?.value).toContain("<#222222222>");
    expect(embed.embed.fields?.[0]?.value).toContain("<#333333333>");
  });
});
