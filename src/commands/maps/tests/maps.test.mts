import { describe, it, beforeEach, expect, vi } from "vitest";
import type {
  APIInteractionResponseChannelMessageWithSource,
  APIApplicationCommandInteraction,
  GuildMemberFlags,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType, InteractionType, Locale } from "discord-api-types/v10";
import { MapsCommand } from "../maps.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import type { Services } from "../../../services/install.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

function aFakeMapsInteractionWith(
  options: { name: string; value: unknown; type: number }[] = [],
): APIApplicationCommandInteraction {
  const fake = {
    id: "fake-id",
    application_id: "fake-app-id",
    type: InteractionType.ApplicationCommand,
    data: {
      id: "fake-cmd-id",
      name: "maps",
      type: 1, // Use 1 for ChatInput
      options,
    },
    guild_id: "fake-guild-id",
    channel_id: "fake-channel-id",
    channel: {
      id: "fake-channel-id",
      type: 0, // GuildText
      name: "test",
    },
    member: {
      user: {
        id: "fake-user-id",
        username: "user",
        discriminator: "0001",
        avatar: null,
        global_name: null,
      },
      roles: [],
      premium_since: null,
      permissions: "0",
      pending: false,
      nick: null,
      mute: false,
      joined_at: new Date().toISOString(),
      deaf: false,
      avatar: null,
      flags: 1 as GuildMemberFlags,
    },
    token: "fake-token",
    version: 1,
    app_permissions: "0",
    locale: Locale.EnglishUS,
    guild_locale: Locale.EnglishUS,
    entitlements: [],
    authorizing_integration_owners: {},
    attachment_size_limit: 10000,
  };
  return fake as unknown as APIApplicationCommandInteraction;
}

describe("MapsCommand", () => {
  let command: MapsCommand;
  let services: Services;
  const env = aFakeEnvWith();

  beforeEach(() => {
    services = installFakeServicesWith({ env });
    command = new MapsCommand(services, env);
    vi.spyOn(services.logService, "error").mockImplementation(() => undefined);
    vi.spyOn(services.discordService, "getEmojiFromName").mockReturnValue(":gamecoachgg:");
  });

  describe("/maps basic usage", () => {
    it("returns a set of 5 maps by default", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      expect(data).toHaveProperty("embeds");
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.length).toBe(3); // #, Mode, Map columns
      expect(embed?.fields?.[0]?.value.split("\n").length).toBe(5);
    });

    it("returns a set of 3 maps when count=3", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 3, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n").length).toBe(3);
    });

    it("returns a set of 7 maps when count=7", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 7, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n").length).toBe(7);
    });
  });

  describe("/maps playlist option", () => {
    it("returns maps from the historical playlist when selected", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "playlist", value: "hcs-historical", type: ApplicationCommandOptionType.String },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.[0]?.value.split("\n").length).toBe(5);
    });

    it("returns maps from the current playlist by default", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.[0]?.value.split("\n").length).toBe(5);
    });
  });

  describe("/maps uniqueness and spread", () => {
    it("does not repeat maps in a short series", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 3, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      const maps = embed?.fields?.[2]?.value.split("\n") ?? [];
      const uniqueMaps = new Set(maps);
      expect(uniqueMaps.size).toBe(maps.length);
    });

    it("allows repeats only after all maps are used in a long series", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 7, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      const maps = embed?.fields?.[2]?.value.split("\n") ?? [];
      const uniqueMaps = new Set(maps);
      expect(uniqueMaps.size).toBeLessThanOrEqual(maps.length);
      expect(uniqueMaps.size).toBeGreaterThanOrEqual(5); // At least 5 unique maps in a Bo7
    });
  });

  describe("/maps error handling", () => {
    it("returns an error message if something throws", () => {
      vi.spyOn(Object.getPrototypeOf(command), "generateHcsSet").mockImplementation(() => {
        throw new Error("fail");
      });
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      expect(data.content).toMatch(/fail/);
      expect(data.flags).toBe(64); // Ephemeral
    });
  });
});
