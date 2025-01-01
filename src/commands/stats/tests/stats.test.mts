import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { StatsCommand } from "../stats.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import {
  apiMessage,
  applicationCommandInteractionStatsMatch,
  applicationCommandInteractionStatsNeatQueue,
  channelThreadsResult,
  discordNeatQueueData,
} from "../../../services/discord/fakes/data.mjs";
import { matchStats, playerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

describe("StatsCommand", () => {
  let statsCommand: StatsCommand;
  let services: Services;
  let updateDeferredReplySpy: MockInstance;

  beforeEach(() => {
    services = installFakeServicesWith();
    statsCommand = new StatsCommand(services);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
  });

  describe("execute()", () => {
    describe("neatqueue", () => {
      beforeEach(() => {
        vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
          name: "neatqueue",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
            ["channel", "1234567890"],
            ["queue", 5],
          ]),
          options: [],
        });
      });

      it("returns response and jobToComplete", () => {
        const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);

        expect(response).toEqual({
          data: {},
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("returns an error state for missing options 'channel'", () => {
        vi.spyOn(services.discordService, "extractSubcommand")
          .mockReset()
          .mockReturnValue({
            name: "neatqueue",
            mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([["queue", 5]]),
            options: [],
          });

        const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
        expect(response).toEqual({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "Error: Missing channel",
            flags: MessageFlags.Ephemeral,
          },
        });
        expect(jobToComplete).toBeUndefined();
      });

      it("returns an error state for missing options 'queue'", () => {
        vi.spyOn(services.discordService, "extractSubcommand")
          .mockReset()
          .mockReturnValue({
            name: "neatqueue",
            mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
              ["channel", "1234567890"],
            ]),
            options: [],
          });

        const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
        expect(response).toEqual({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "Error: Missing queue",
            flags: MessageFlags.Ephemeral,
          },
        });
        expect(jobToComplete).toBeUndefined();
      });

      describe("jobToComplete", () => {
        let jobToComplete: (() => Promise<void>) | undefined;
        let getTeamsFromQueueSpy: MockInstance;
        let getSeriesFromDiscordQueueSpy: MockInstance;
        let getMessageFromInteractionTokenSpy: MockInstance;
        let startThreadFromMessageSpy: MockInstance;
        let createMessageSpy: MockInstance;
        let updateDiscordAssociationsSpy: MockInstance;

        beforeEach(() => {
          getTeamsFromQueueSpy = vi
            .spyOn(services.discordService, "getTeamsFromQueue")
            .mockResolvedValue(discordNeatQueueData);
          getSeriesFromDiscordQueueSpy = vi
            .spyOn(services.haloService, "getSeriesFromDiscordQueue")
            .mockResolvedValue(Array.from(matchStats.values()).slice(0, 3));
          getMessageFromInteractionTokenSpy = vi
            .spyOn(services.discordService, "getMessageFromInteractionToken")
            .mockResolvedValue(apiMessage);
          startThreadFromMessageSpy = vi
            .spyOn(services.discordService, "startThreadFromMessage")
            .mockResolvedValue(channelThreadsResult);
          createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
          updateDiscordAssociationsSpy = vi
            .spyOn(services.haloService, "updateDiscordAssociations")
            .mockResolvedValue();

          const { jobToComplete: jtc } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
          jobToComplete = jtc;
        });

        it("fetches queue data from discordService", async () => {
          await jobToComplete?.();

          expect(getTeamsFromQueueSpy).toHaveBeenCalledWith("1234567890", 5, "en-US");
        });

        it("calls discordService.updateDeferredReply with an error when no data is returned from getTeamsFromQueue", async () => {
          getTeamsFromQueueSpy.mockReset().mockResolvedValue(undefined);

          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
            content:
              "Failed to fetch (Channel: <#1234567890>, queue: 5): No queue found within the last 100 messages of <#1234567890>, with queue number 5",
          });
        });

        it('fetches series data from haloService using "getSeriesFromDiscordQueue"', async () => {
          await jobToComplete?.();

          expect(getSeriesFromDiscordQueueSpy).toHaveBeenCalledWith(discordNeatQueueData);
        });

        it("calls discordService.updateDeferredReply with series embeds", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.lastCall).toMatchSnapshot();
        });

        it("calls discordService.getMessageFromInteractionToken", async () => {
          await jobToComplete?.();

          expect(getMessageFromInteractionTokenSpy).toHaveBeenCalledWith(
            applicationCommandInteractionStatsNeatQueue.token,
          );
        });

        it("calls discordService.startThreadFromMessage", async () => {
          await jobToComplete?.();

          expect(startThreadFromMessageSpy).toHaveBeenCalledWith(
            "1299532381308325949",
            "1314562775950954626",
            "Queue #5 series stats",
          );
        });

        it("adds each game and series summary to the thread", async () => {
          await jobToComplete?.();

          expect(createMessageSpy).toHaveBeenCalledTimes(4);
          expect(createMessageSpy.mock.calls).toMatchSnapshot();
        });

        it("calls haloService.updateDiscordAssociations", async () => {
          await jobToComplete?.();

          expect(updateDiscordAssociationsSpy).toHaveBeenCalledWith();
        });

        it("does nothing if error is thrown with message 'Too many subrequests.'", async () => {
          getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(new Error("Too many subrequests."));

          await jobToComplete?.();

          expect(updateDeferredReplySpy).not.toHaveBeenCalled();
        });

        it("calls discordService.updateDeferredReply with an error when an error is thrown", async () => {
          getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(new Error("An error occurred."));

          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
            content: "Failed to fetch (Channel: <#1234567890>, queue: 5): An error occurred.",
          });
        });
      });
    });

    describe("match", () => {
      beforeEach(() => {
        vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
          name: "match",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
            ["id", "d81554d7-ddfe-44da-a6cb-000000000ctf"],
          ]),
          options: [],
        });
      });

      it("returns response and jobToComplete", () => {
        const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsMatch);

        expect(response).toEqual({
          data: {},
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("returns an error state for missing options 'id'", () => {
        vi.spyOn(services.discordService, "extractSubcommand")
          .mockReset()
          .mockReturnValue({
            name: "match",
            mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
              ["private", true],
            ]),
            options: [],
          });

        const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsMatch);
        expect(response).toEqual({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "Error: Missing match id",
            flags: MessageFlags.Ephemeral,
          },
        });
        expect(jobToComplete).toBeUndefined();
      });

      describe("jobToComplete", () => {
        const ctfMatch = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
        let jobToComplete: (() => Promise<void>) | undefined;
        let getMatchDetailsSpy: MockInstance;
        let getPlayerXuidsToGamertagsSpy: MockInstance;

        beforeEach(() => {
          getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([ctfMatch]);
          getPlayerXuidsToGamertagsSpy = vi
            .spyOn(services.haloService, "getPlayerXuidsToGametags")
            .mockResolvedValue(playerXuidsToGametags);

          const { jobToComplete: jtc } = statsCommand.execute(applicationCommandInteractionStatsMatch);
          jobToComplete = jtc;
        });

        it("calls haloService.getMatchDetails", async () => {
          await jobToComplete?.();

          expect(getMatchDetailsSpy).toHaveBeenCalledWith(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);
        });

        it("calls discordService.updateDeferredReply with an error when no data is returned from getMatchDetails", async () => {
          getMatchDetailsSpy.mockReset().mockResolvedValue([]);

          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
            content: "Match not found",
          });
        });

        it("calls haloService.getPlayerXuidsToGamertags with the match data", async () => {
          await jobToComplete?.();

          expect(getPlayerXuidsToGamertagsSpy).toHaveBeenCalledWith(ctfMatch);
        });

        it("calls discordService.updateDeferredReply with match embeds", async () => {
          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy.mock.lastCall).toMatchSnapshot();
        });

        it("does nothing if error is thrown with message 'Too many subrequests.'", async () => {
          getMatchDetailsSpy.mockReset().mockRejectedValue(new Error("Too many subrequests."));

          await jobToComplete?.();

          expect(updateDeferredReplySpy).not.toHaveBeenCalled();
        });

        it("calls discordService.updateDeferredReply with an error when an error is thrown", async () => {
          getMatchDetailsSpy.mockReset().mockRejectedValue(new Error("An error occurred."));

          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
            content: "Failed to fetch (match id: d81554d7-ddfe-44da-a6cb-000000000ctf}): An error occurred.",
          });
        });
      });
    });

    describe("not found", () => {
      const applicationCommandInteractionNotFound: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsMatch,
        data: {
          id: "1300004385459408960",
          name: "not-found",
          options: [],
          type: 1,
        },
      };

      beforeEach(() => {
        vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
          name: "not-found",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([]),
          options: [],
        });
      });

      it("returns an error response", () => {
        expect(statsCommand.execute(applicationCommandInteractionNotFound)).toEqual({
          response: {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: "Error: Missing subcommand options",
              flags: MessageFlags.Ephemeral,
            },
          },
        });
      });
    });
  });
});
