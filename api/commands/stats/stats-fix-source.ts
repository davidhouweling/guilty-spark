import type { APIMessage } from "discord-api-types/v10";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { DiscordService } from "../../services/discord/discord";
import { extractQueueNumberFromSeriesOverviewEmbed } from "../../services/discord/discord-series-stats";
import { EndUserError } from "../../base/end-user-error";
import type { FixSeriesSource } from "./stats-flow-types";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";

function isManualSeriesOverview(message: APIMessage): boolean {
  return message.embeds.some((embed) => embed.fields?.some((field) => field.name === "Created manually by") === true);
}

export async function getQueueDataFromSeriesOverview(
  discordService: DiscordService,
  guildId: string,
  queueNumber: number,
): Promise<FixSeriesSource | undefined> {
  const overviewMessage = await discordService.findSeriesOverviewMessage(guildId, queueNumber);
  if (overviewMessage == null) {
    return undefined;
  }

  return {
    queueData: await discordService.getTeamsFromSeriesOverview(guildId, overviewMessage, queueNumber),
    channelId: overviewMessage.channel_id,
    sourceKind: "series-overview",
    isManualSeries: queueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(overviewMessage),
  };
}

export async function getFixQueueData(
  discordService: DiscordService,
  guildId: string,
  channelId: string,
  queueNumber: number,
): Promise<FixSeriesSource> {
  if (queueNumber >= MANUAL_QUEUE_NUMBER_MIN) {
    const fromOverview = await getQueueDataFromSeriesOverview(discordService, guildId, queueNumber);
    if (fromOverview == null) {
      throw new EndUserError(`Could not find series stats for queue #${queueNumber.toString()}.`);
    }

    return fromOverview;
  }

  try {
    return {
      queueData: await discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber),
      channelId,
      sourceKind: "neatqueue-result",
      isManualSeries: false,
    };
  } catch (error) {
    if (!(error instanceof EndUserError)) {
      throw error;
    }

    const fromOverview = await getQueueDataFromSeriesOverview(discordService, guildId, queueNumber);
    if (fromOverview == null) {
      throw error;
    }

    return fromOverview;
  }
}

export async function getQueueDataFromThreadStarterMessage(
  discordService: DiscordService,
  applicationId: string,
  guildId: string,
  channelId: string,
  threadId: string,
): Promise<FixSeriesSource> {
  const notFoundError = new EndUserError(
    "Could not determine which queue this thread's stats are for. Try running /stats fix queue_number:<queue> from the parent channel instead.",
  );

  let starterMessage: APIMessage;
  try {
    starterMessage = await discordService.getMessage(channelId, threadId);
  } catch {
    throw notFoundError;
  }

  if (starterMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
    return {
      queueData: await discordService.getTeamsFromMessage(guildId, starterMessage),
      channelId,
      sourceKind: "neatqueue-result",
      isManualSeries: false,
    };
  }

  const overviewQueueNumber =
    starterMessage.author.id === applicationId ? extractQueueNumberFromSeriesOverviewEmbed(starterMessage) : undefined;
  if (overviewQueueNumber == null) {
    throw notFoundError;
  }

  return {
    queueData: await discordService.getTeamsFromSeriesOverview(guildId, starterMessage, overviewQueueNumber),
    channelId,
    sourceKind: "series-overview",
    isManualSeries: overviewQueueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(starterMessage),
  };
}
