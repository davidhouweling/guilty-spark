import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIEmbed,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import {
  GuildMemberFlags,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  Locale,
  InteractionResponseType,
} from "discord-api-types/v10";
import type { PlaylistCsr } from "halo-infinite-api";
import { ServiceRecordCommand } from "../service-record.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeDiscordAssociationsRow } from "../../../services/database/fakes/database.fake.mjs";
import { AssociationReason } from "../../../services/database/types/discord_associations.mjs";
import { EndUserError } from "../../../base/end-user-error.mjs";
import { aFakeServiceRecordWith } from "../../../services/halo/fakes/data.mjs";

const userContextMenuInteraction: APIUserApplicationCommandGuildInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "fake-guild-id",
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: {
    id: "fake-command-id",
    name: "Service record",
    type: ApplicationCommandType.User,
    target_id: "target-user-123",
    resolved: {
      users: {},
    },
  },
  app_permissions: "",
  application_id: "fake-application-id",
  attachment_size_limit: 0,
  authorizing_integration_owners: {},
  channel: {
    id: "fake-channel-id",
    type: 0,
  },
  entitlements: [],
  locale: Locale.EnglishUS,
  id: "fake-interaction-id",
  member: {
    deaf: false,
    flags: GuildMemberFlags.CompletedOnboarding,
    joined_at: "2024-01-01T00:00:00.000Z",
    mute: false,
    roles: [],
    permissions: "",
    user: {
      avatar: null,
      id: "fake-user-id",
      discriminator: "0001",
      username: "FakeUser",
      global_name: null,
    },
  },
};

const slashCommandInteraction: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "fake-guild-id",
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: {
    id: "fake-command-id",
    name: "servicerecord",
    options: [
      {
        name: "player",
        type: ApplicationCommandOptionType.User,
        value: "target-user-456",
      },
    ],
    type: ApplicationCommandType.ChatInput,
  },
};

describe("ServiceRecordCommand", () => {
  let env: Env;
  let services: Services;
  let serviceRecordCommand: ServiceRecordCommand;

  const mockServiceRecord = aFakeServiceRecordWith({
    TimePlayed: "PT100H30M15S",
    MatchesCompleted: 500,
    Wins: 300,
    Losses: 180,
    Ties: 20,
  });
  const mockCsr: PlaylistCsr = {
    Value: 1450,
    Tier: "Diamond",
    SubTier: 5,
    MeasurementMatchesRemaining: 0,
    TierStart: 1450,
    NextTier: "Onyx",
    NextTierStart: 1500,
    InitialMeasurementMatches: 10,
    DemotionProtectionMatchesRemaining: 0,
    InitialDemotionProtectionMatches: 5,
    NextSubTier: 0,
  };

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    serviceRecordCommand = new ServiceRecordCommand(services, env);
  });

  describe("commands", () => {
    it("includes User context menu command", () => {
      const userCommand = serviceRecordCommand.commands.find((cmd) => cmd.type === ApplicationCommandType.User);
      expect(userCommand).toBeDefined();
      expect(userCommand?.name).toBe("Service record");
    });

    it("includes slash command", () => {
      const slashCommand = serviceRecordCommand.commands.find((cmd) => cmd.type === ApplicationCommandType.ChatInput);
      expect(slashCommand).toBeDefined();
      expect(slashCommand?.name).toBe("servicerecord");
    });
  });

  describe("execute - User context menu", () => {
    it("defers the reply and fetches service record for the target user", async () => {
      const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply");
      const getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
      const getRankedArenaCsrsSpy = vi.spyOn(services.haloService, "getRankedArenaCsrs");
      const getUsersByXuidsSpy = vi.spyOn(services.haloService, "getUsersByXuids");
      const getServiceRecordSpy = vi.spyOn(services.haloService, "getServiceRecord");
      const getPlayerEsraSpy = vi.spyOn(services.haloService, "getPlayerEsra");

      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "target-user-123",
          XboxId: "xbox-123",
          AssociationReason: AssociationReason.CONNECTED,
        }),
      ]);

      getRankedArenaCsrsSpy.mockResolvedValue(
        new Map([["xbox-123", { Current: mockCsr, SeasonMax: mockCsr, AllTimeMax: mockCsr }]]),
      );

      getUsersByXuidsSpy.mockResolvedValue([{ xuid: "xbox-123", gamertag: "TestGamer" }]);
      getServiceRecordSpy.mockResolvedValue(mockServiceRecord);
      getPlayerEsraSpy.mockResolvedValue(1350);

      const result = serviceRecordCommand.execute(userContextMenuInteraction);

      expect(result.response.type).toBe(InteractionResponseType.DeferredChannelMessageWithSource);
      expect(result.jobToComplete).toBeDefined();

      if (result.jobToComplete) {
        await result.jobToComplete();
      }

      expect(getDiscordAssociationsSpy).toHaveBeenCalledWith(["target-user-123"]);
      expect(getRankedArenaCsrsSpy).toHaveBeenCalledWith(["xbox-123"]);
      expect(getUsersByXuidsSpy).toHaveBeenCalledWith(["xbox-123"]);
      expect(getServiceRecordSpy).toHaveBeenCalledWith("xbox-123");
      expect(getPlayerEsraSpy).toHaveBeenCalledWith("xbox-123");

      expect(updateDeferredReplySpy).toHaveBeenCalledWith(
        userContextMenuInteraction.token,
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Service record",
            }),
          ]) as APIEmbed[],
        }),
      );
    });

    it("throws error when user has no Xbox association", async () => {
      const updateDeferredReplyWithErrorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError");
      const getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");

      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "target-user-123",
          XboxId: "",
        }),
      ]);

      const result = serviceRecordCommand.execute(userContextMenuInteraction);

      expect(result.jobToComplete).toBeDefined();

      if (result.jobToComplete) {
        await result.jobToComplete();
      }

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        userContextMenuInteraction.token,
        expect.any(EndUserError),
      );
    });
  });

  describe("execute - Slash command", () => {
    it("defers the reply and fetches service record for the specified player", async () => {
      const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply");
      const getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
      const getRankedArenaCsrsSpy = vi.spyOn(services.haloService, "getRankedArenaCsrs");
      const getUsersByXuidsSpy = vi.spyOn(services.haloService, "getUsersByXuids");
      const getServiceRecordSpy = vi.spyOn(services.haloService, "getServiceRecord");
      const getPlayerEsraSpy = vi.spyOn(services.haloService, "getPlayerEsra");

      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "target-user-456",
          XboxId: "xbox-456",
          AssociationReason: AssociationReason.USERNAME_SEARCH,
        }),
      ]);

      getRankedArenaCsrsSpy.mockResolvedValue(
        new Map([["xbox-456", { Current: mockCsr, SeasonMax: mockCsr, AllTimeMax: mockCsr }]]),
      );

      getUsersByXuidsSpy.mockResolvedValue([{ xuid: "xbox-456", gamertag: "AnotherGamer" }]);
      getServiceRecordSpy.mockResolvedValue(mockServiceRecord);
      getPlayerEsraSpy.mockResolvedValue(1500);

      const result = serviceRecordCommand.execute(slashCommandInteraction);

      expect(result.response.type).toBe(InteractionResponseType.DeferredChannelMessageWithSource);
      expect(result.jobToComplete).toBeDefined();

      if (result.jobToComplete) {
        await result.jobToComplete();
      }

      expect(getDiscordAssociationsSpy).toHaveBeenCalledWith(["target-user-456"]);
      expect(getRankedArenaCsrsSpy).toHaveBeenCalledWith(["xbox-456"]);
      expect(getUsersByXuidsSpy).toHaveBeenCalledWith(["xbox-456"]);
      expect(getServiceRecordSpy).toHaveBeenCalledWith("xbox-456");
      expect(updateDeferredReplySpy).toHaveBeenCalled();
    });

    it("handles service record API errors gracefully", async () => {
      const updateDeferredReplyWithErrorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError");
      const getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
      const getRankedArenaCsrsSpy = vi.spyOn(services.haloService, "getRankedArenaCsrs");
      const getUsersByXuidsSpy = vi.spyOn(services.haloService, "getUsersByXuids");
      const getServiceRecordSpy = vi.spyOn(services.haloService, "getServiceRecord");

      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "target-user-456",
          XboxId: "xbox-456",
        }),
      ]);

      getRankedArenaCsrsSpy.mockResolvedValue(
        new Map([["xbox-456", { Current: mockCsr, SeasonMax: mockCsr, AllTimeMax: mockCsr }]]),
      );

      getUsersByXuidsSpy.mockResolvedValue([{ xuid: "xbox-456", gamertag: "FailGamer" }]);
      getServiceRecordSpy.mockRejectedValue(new Error("API Error"));

      const result = serviceRecordCommand.execute(slashCommandInteraction);

      if (result.jobToComplete) {
        await result.jobToComplete();
      }

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        slashCommandInteraction.token,
        expect.any(EndUserError),
      );
    });
  });

  describe("data", () => {
    it("includes all command registrations", () => {
      const { data } = serviceRecordCommand;
      expect(data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
