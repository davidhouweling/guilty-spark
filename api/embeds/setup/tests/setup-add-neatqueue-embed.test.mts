import { describe, expect, it } from "vitest";
import { SetupAddNeatQueueEmbed } from "../setup-add-neatqueue-embed.mjs";

describe("SetupAddNeatQueueEmbed", () => {
  it("returns embed with step 1 question", () => {
    const embed = new SetupAddNeatQueueEmbed({
      description: "Follow the prompts to add a NeatQueue integration.",
      stepNumber: 1,
      stepQuestion: "Enter the NeatQueue channel ID",
    });

    expect(embed.embed).toMatchObject({
      title: "Add NeatQueue Integration",
      description: "Follow the prompts to add a NeatQueue integration.",
      fields: [
        {
          name: "Step 1",
          value: "Enter the NeatQueue channel ID",
        },
      ],
    });
  });

  it("returns embed with step 3 question", () => {
    const embed = new SetupAddNeatQueueEmbed({
      description: "Follow the prompts to add a NeatQueue integration.\n\n**Informer Role**: <@&123456>",
      stepNumber: 3,
      stepQuestion: "Enter the polling interval in seconds (minimum 30)",
    });

    expect(embed.embed).toMatchObject({
      title: "Add NeatQueue Integration",
      description: "Follow the prompts to add a NeatQueue integration.\n\n**Informer Role**: <@&123456>",
      fields: [
        {
          name: "Step 3",
          value: "Enter the polling interval in seconds (minimum 30)",
        },
      ],
    });
  });

  it("returns embed with multi-line question", () => {
    const embed = new SetupAddNeatQueueEmbed({
      description: "Follow the prompts to add a NeatQueue integration.\n\n**Channel**: <#987654>",
      stepNumber: 2,
      stepQuestion: "Select the informer role:\n- Mentions this role when matches are found\n- Must be mentionable",
    });

    expect(embed.embed).toMatchObject({
      title: "Add NeatQueue Integration",
      fields: [
        {
          name: "Step 2",
          value: "Select the informer role:\n- Mentions this role when matches are found\n- Must be mentionable",
        },
      ],
    });
  });
});
