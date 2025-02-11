import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect, afterEach } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";
import {
  MessageFlags,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  Locale,
  ComponentType,
} from "discord-api-types/v10";
import { ConnectCommand, GamertagSearchModal, InteractionButton } from "../connect.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import {
  apiMessage,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
  modalSubmitInteraction,
} from "../../../services/discord/fakes/data.mjs";
import { aFakeDiscordAssociationsRow } from "../../../services/database/fakes/database.fake.mjs";
import type { DiscordAssociationsRow } from "../../../services/database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../../../services/database/types/discord_associations.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

const applicationCommandInteractionConnect: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "fake-guild-id",
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: {
    id: "1296081783443685377",
    name: "connect",
    options: [],
    resolved: {},
    type: ApplicationCommandType.ChatInput,
  },
};

describe("ConnectCommand", () => {
  let connectCommand: ConnectCommand;
  let services: Services;
  let updateDeferredReplySpy: MockInstance<typeof services.discordService.updateDeferredReply>;

  beforeEach(() => {
    vi.setSystemTime("2025-02-10T00:00:00.000Z");
    services = installFakeServicesWith();
    connectCommand = new ConnectCommand(services);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("execute(): /command", () => {
    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(applicationCommandInteractionConnect);

      expect(response).toEqual<APIInteractionResponse>({
        data: {
          flags: MessageFlags.Ephemeral,
        },
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getDiscordAssociationsSpy: MockInstance<typeof services.databaseService.getDiscordAssociations>;
      let getUsersByXuidsSpy: MockInstance<typeof services.haloService.getUsersByXuids>;

      beforeEach(() => {
        getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
        getUsersByXuidsSpy = vi.spyOn(services.haloService, "getUsersByXuids");

        const { jobToComplete: jtc } = connectCommand.execute(applicationCommandInteractionConnect);
        jobToComplete = jtc;
      });

      it("calls getDiscordAssociations with the expected opts", async () => {
        await jobToComplete?.();

        expect(getDiscordAssociationsSpy).toHaveBeenCalledOnce();
        expect(getDiscordAssociationsSpy).toHaveBeenCalledWith(["discord_user_01"]);
      });

      describe.each([
        {
          associationReason: "CONNECTED",
          associationReasonValue: AssociationReason.CONNECTED,
          gamesRetrievable: GamesRetrievable.YES,
          callsGetUsersByXuids: true,
        },
        {
          associationReason: "CONNECTED",
          associationReasonValue: AssociationReason.CONNECTED,
          gamesRetrievable: GamesRetrievable.NO,
          callsGetUsersByXuids: false,
        },
        {
          associationReason: "MANUAL",
          associationReasonValue: AssociationReason.MANUAL,
          gamesRetrievable: GamesRetrievable.YES,
          callsGetUsersByXuids: true,
        },
        {
          associationReason: "MANUAL",
          associationReasonValue: AssociationReason.MANUAL,
          gamesRetrievable: GamesRetrievable.NO,
          callsGetUsersByXuids: false,
        },
        {
          associationReason: "USERNAME_SEARCH",
          associationReasonValue: AssociationReason.USERNAME_SEARCH,
          gamesRetrievable: GamesRetrievable.YES,
          callsGetUsersByXuids: true,
        },
        {
          associationReason: "USERNAME_SEARCH",
          associationReasonValue: AssociationReason.USERNAME_SEARCH,
          gamesRetrievable: GamesRetrievable.NO,
          callsGetUsersByXuids: false,
        },
        {
          associationReason: "DISPLAY_NAME_SEARCH",
          associationReasonValue: AssociationReason.DISPLAY_NAME_SEARCH,
          gamesRetrievable: GamesRetrievable.YES,
          callsGetUsersByXuids: true,
        },
        {
          associationReason: "DISPLAY_NAME_SEARCH",
          associationReasonValue: AssociationReason.DISPLAY_NAME_SEARCH,
          gamesRetrievable: GamesRetrievable.NO,
          callsGetUsersByXuids: false,
        },
        {
          associationReason: "GAME_SIMILARITY",
          associationReasonValue: AssociationReason.GAME_SIMILARITY,
          gamesRetrievable: GamesRetrievable.YES,
          callsGetUsersByXuids: true,
        },
        {
          associationReason: "GAME_SIMILARITY",
          associationReasonValue: AssociationReason.GAME_SIMILARITY,
          gamesRetrievable: GamesRetrievable.NO,
          callsGetUsersByXuids: false,
        },
        {
          associationReason: "UNKNOWN",
          associationReasonValue: AssociationReason.UNKNOWN,
          gamesRetrievable: GamesRetrievable.UNKNOWN,
          callsGetUsersByXuids: false,
        },
      ])(
        "AssociationReason = $associationReason & GamesRetrievable = $gamesRetrievable",
        ({ associationReasonValue, gamesRetrievable, callsGetUsersByXuids: getUsersByXuids }) => {
          beforeEach(() => {
            getDiscordAssociationsSpy.mockResolvedValue([
              aFakeDiscordAssociationsRow({
                AssociationReason: associationReasonValue,
                GamesRetrievable: gamesRetrievable,
              }),
            ]);

            if (!getUsersByXuids) {
              getUsersByXuidsSpy.mockResolvedValue([]);
            }
          });

          if (getUsersByXuids) {
            it("calls getUsersByXuids with the expected opts", async () => {
              await jobToComplete?.();

              expect(getUsersByXuidsSpy).toHaveBeenCalledOnce();
              expect(getUsersByXuidsSpy).toHaveBeenCalledWith(["0000000000001"]);
            });
          } else {
            it("does not call getUsersByXuids", async () => {
              await jobToComplete?.();

              expect(getUsersByXuidsSpy).not.toHaveBeenCalled();
            });
          }

          it("calls updateDeferredReply with the expected opts", async () => {
            await jobToComplete?.();

            expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
            expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
          });
        },
      );

      describe("No Association", () => {
        beforeEach(() => {
          getDiscordAssociationsSpy.mockResolvedValue([]);
        });

        it("does not call getUsersByXuids", async () => {
          await jobToComplete?.();

          expect(getUsersByXuidsSpy).not.toHaveBeenCalled();
        });

        it("calls updateDeferredReply with the expected opts", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
        });
      });
    });
  });

  describe("execute(): InteractionButton.Confirm", () => {
    const confirmButtonInteraction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      data: {
        ...fakeButtonClickInteraction.data,
        custom_id: InteractionButton.Confirm,
      },
    };

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(confirmButtonInteraction);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getDiscordAssociationsSpy: MockInstance<typeof services.databaseService.getDiscordAssociations>;
      let upsertDiscordAssociationsSpy: MockInstance<typeof services.databaseService.upsertDiscordAssociations>;

      beforeEach(() => {
        getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
        upsertDiscordAssociationsSpy = vi.spyOn(services.databaseService, "upsertDiscordAssociations");

        const { jobToComplete: jtc } = connectCommand.execute(confirmButtonInteraction);
        jobToComplete = jtc;
      });

      describe("Existing association", () => {
        let associationData: DiscordAssociationsRow;

        beforeEach(() => {
          associationData = aFakeDiscordAssociationsRow();
          getDiscordAssociationsSpy.mockImplementation(async () => Promise.resolve([associationData]));
          upsertDiscordAssociationsSpy.mockImplementation(async (newAssociationsData) => {
            associationData = Preconditions.checkExists(newAssociationsData[0], "No association data");

            return Promise.resolve();
          });
        });

        it("gets existing discord association", async () => {
          await jobToComplete?.();

          expect(getDiscordAssociationsSpy).toHaveBeenCalledTimes(2);
          expect(getDiscordAssociationsSpy).toHaveBeenCalledWith(["discord_user_01"]);
        });

        it("upserts discord association", async () => {
          await jobToComplete?.();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith([
            {
              AssociationDate: 1725148800000,
              AssociationReason: AssociationReason.MANUAL,
              DiscordId: "discord_user_01",
              GamesRetrievable: GamesRetrievable.YES,
              XboxId: "0000000000001",
            },
          ]);
        });

        it("calls updateDeferredReply with the expected opts", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
        });
      });

      describe("No association", () => {
        let consoleErrorSpy: MockInstance<typeof console.error>;
        let consoleTraceSpy: MockInstance<typeof console.trace>;

        beforeEach(() => {
          consoleErrorSpy = vi.spyOn(console, "error");
          consoleTraceSpy = vi.spyOn(console, "trace");
          getDiscordAssociationsSpy.mockResolvedValue([]);
        });

        it("logs error", async () => {
          await jobToComplete?.();

          // 2 calls to console.error: 1 for the error, 1 for the stack trace
          expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
          expect(consoleErrorSpy).toHaveBeenCalledWith(new Error("Connection not found"));
          expect(consoleTraceSpy).toHaveBeenCalledOnce();
        });

        it("calls updateDeferredReply with the expected opts", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
            content: "Failed to update: Connection not found",
          });
        });
      });
    });
  });

  describe("execute(): InteractionButton.Change", () => {
    const changeButtonInteraction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      data: {
        ...fakeButtonClickInteraction.data,
        custom_id: InteractionButton.Change,
      },
    };

    it("returns response but no jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(changeButtonInteraction);

      expect(response).toMatchSnapshot();
      expect(jobToComplete).toBeUndefined();
    });
  });

  describe("execute(): InteractionButton.Remove", () => {
    const removeButtonInteraction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      data: {
        ...fakeButtonClickInteraction.data,
        custom_id: InteractionButton.Remove,
      },
    };

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(removeButtonInteraction);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let deleteDiscordAssociationsSpy: MockInstance<typeof services.databaseService.deleteDiscordAssociations>;

      beforeEach(() => {
        deleteDiscordAssociationsSpy = vi.spyOn(services.databaseService, "deleteDiscordAssociations");

        const { jobToComplete: jtc } = connectCommand.execute(removeButtonInteraction);
        jobToComplete = jtc;
      });

      it("calls deleteDiscordAssociations with the expected opts", async () => {
        await jobToComplete?.();

        expect(deleteDiscordAssociationsSpy).toHaveBeenCalledOnce();
        expect(deleteDiscordAssociationsSpy).toHaveBeenCalledWith(["discord_user_01"]);
      });

      it("calls updateDeferredReply with the expected opts", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
      });
    });
  });

  describe("execute(): InteractionType.ModalSubmit GamertagSearchModal", () => {
    const gamertagSearchModalSubmit: APIModalSubmitInteraction = {
      ...modalSubmitInteraction,
      data: {
        components: [
          {
            components: [{ custom_id: "gamertag", type: ComponentType.TextInput, value: "gamertag0000000000001" }],
            type: ComponentType.ActionRow,
          },
        ],
        custom_id: GamertagSearchModal,
      },
    };

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(gamertagSearchModalSubmit);

      expect(response).toMatchSnapshot();
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;

      beforeEach(() => {
        const { jobToComplete: jtc } = connectCommand.execute(gamertagSearchModalSubmit);
        jobToComplete = jtc;
      });

      it("calls updateDeferredReply with the expected opts", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
      });
    });
  });

  describe("execute(): InteractionButton.SearchConfirm", () => {
    const searchConfirmButtonInteraction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      data: {
        ...fakeButtonClickInteraction.data,
        custom_id: InteractionButton.SearchConfirm,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        embeds: [{ title: `Gamertag search for "gamertag0000000000001"` }],
      },
    };

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(searchConfirmButtonInteraction);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let associationData: DiscordAssociationsRow;
      let getDiscordAssociationsSpy: MockInstance<typeof services.databaseService.getDiscordAssociations>;
      let upsertDiscordAssociationsSpy: MockInstance<typeof services.databaseService.upsertDiscordAssociations>;

      beforeEach(() => {
        getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");
        upsertDiscordAssociationsSpy = vi.spyOn(services.databaseService, "upsertDiscordAssociations");

        associationData = aFakeDiscordAssociationsRow();
        getDiscordAssociationsSpy.mockImplementation(async () => Promise.resolve([associationData]));
        upsertDiscordAssociationsSpy.mockImplementation(async (newAssociationsData) => {
          associationData = Preconditions.checkExists(newAssociationsData[0], "No association data");

          return Promise.resolve();
        });

        const { jobToComplete: jtc } = connectCommand.execute(searchConfirmButtonInteraction);
        jobToComplete = jtc;
      });

      it("upserts discord association", async () => {
        await jobToComplete?.();

        expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
        expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith([
          {
            AssociationDate: 1739145600000,
            AssociationReason: AssociationReason.MANUAL,
            DiscordId: "discord_user_01",
            GamesRetrievable: GamesRetrievable.YES,
            XboxId: "0000000000001",
          },
        ]);
      });

      it("calls updateDeferredReply with the expected opts", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
      });
    });
  });

  describe("execute(): InteractionButton.SearchCancel", () => {
    const searchCancelButtonInteraction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      data: {
        ...fakeButtonClickInteraction.data,
        custom_id: InteractionButton.SearchCancel,
      },
    };

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = connectCommand.execute(searchCancelButtonInteraction);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getDiscordAssociationsSpy: MockInstance<typeof services.databaseService.getDiscordAssociations>;

      beforeEach(() => {
        getDiscordAssociationsSpy = vi.spyOn(services.databaseService, "getDiscordAssociations");

        const { jobToComplete: jtc } = connectCommand.execute(searchCancelButtonInteraction);
        jobToComplete = jtc;
      });

      describe("Existing association", () => {
        let associationData: DiscordAssociationsRow;

        beforeEach(() => {
          associationData = aFakeDiscordAssociationsRow();
          getDiscordAssociationsSpy.mockImplementation(async () => Promise.resolve([associationData]));
        });

        it("calls updateDeferredReply with the expected opts", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
        });
      });

      describe("No association", () => {
        beforeEach(() => {
          getDiscordAssociationsSpy.mockResolvedValue([]);
        });

        it("calls updateDeferredReply with the expected opts", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.calls[0]).toMatchSnapshot();
        });
      });
    });
  });
});
