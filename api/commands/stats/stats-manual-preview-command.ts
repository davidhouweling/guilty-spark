import type {
  APIInteractionResponse,
  APIModalInteractionResponseCallbackData,
  APIModalSubmitInteraction,
  APIMessageComponentSelectMenuInteraction,
} from "discord-api-types/v10";
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
} from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import {
  mapManualSeriesToStableTeams,
  resolveManualSeriesTeamMappings,
} from "../../services/halo/manual-series-team-mapping";
import {
  formatManualSeriesScore,
  getOutcomeForManualSeriesScore,
  parseManualSeriesGamesWon,
  toSeriesOverviewTeams,
} from "./manual-series";
import type { ManualSeriesScore } from "./manual-series";
import { InteractionButton } from "./stats-interaction-button";
import type { FixSeriesOutcome, ManualFlowMetadata } from "./stats-flow-types";
import { StatsManualEntryCommand } from "./stats-manual-entry-command";

export abstract class StatsManualPreviewCommand extends StatsManualEntryCommand {
  protected async handleManualOutcomeSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;
    try {
      const selectedSeriesOutcome = this.parseFixSeriesOutcome(
        Preconditions.checkExists(interaction.data.values[0], "No series outcome selected"),
      );
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const series = await this.getManualSeriesMatches(metadata.selectedMatchIds ?? []);
      const seriesScore =
        metadata.seriesScore != null && getOutcomeForManualSeriesScore(metadata.seriesScore) === selectedSeriesOutcome
          ? metadata.seriesScore
          : undefined;

      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, selectedSeriesOutcome, seriesScore },
        series,
        derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  protected createManualScoreModal(): APIInteractionResponse {
    const gamesWonInput = (
      customId: string,
      label: string,
    ): APIModalInteractionResponseCallbackData["components"][number] => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: customId,
          label,
          style: TextInputStyle.Short,
          min_length: 1,
          max_length: 2,
          placeholder: "e.g. 3",
          required: true,
        },
      ],
    });

    return {
      type: InteractionResponseType.Modal,
      data: {
        title: "Adjust final score",
        custom_id: InteractionButton.ManualScoreModal,
        components: [
          gamesWonInput("team0_wins", "🦅 Eagle games won"),
          gamesWonInput("team1_wins", "🐍 Cobra games won"),
        ],
      },
    };
  }

  protected handleManualScoreModal(interaction: APIModalSubmitInteraction): ExecuteResponse {
    const values = this.services.discordService.extractModalSubmitData(interaction);
    const team0 = parseManualSeriesGamesWon(values.get("team0_wins") ?? "");
    const team1 = parseManualSeriesGamesWon(values.get("team1_wins") ?? "");
    if (team0 == null || team1 == null) {
      const warning = new EndUserError("Each team's games won must be a whole number between 0 and 99.", {
        title: "Invalid score",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [warning.discordEmbed], flags: MessageFlags.Ephemeral },
        },
      };
    }

    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async () => this.handleManualScoreSubmitJob(interaction, { team0, team1 }),
    };
  }

  protected getManualSeriesScoreOverride(
    metadata: ManualFlowMetadata,
    locale: string,
    includeEmojis: boolean,
  ): string | undefined {
    return metadata.seriesScore == null
      ? undefined
      : formatManualSeriesScore(metadata.seriesScore, locale, includeEmojis);
  }

  protected async getManualSeriesMatches(matchIds: readonly string[]): Promise<MatchStats[]> {
    if (matchIds.length === 0) {
      throw new EndUserError("No games were selected. Please run /stats manual again.");
    }
    const series = await this.services.haloService.getMatchDetails([...matchIds]);
    if (series.length === 0) {
      throw new EndUserError("No match details found for the selected games.");
    }

    return series;
  }

  protected deriveManualSeriesOutcome(series: MatchStats[]): FixSeriesOutcome | null {
    const orderedSeries = [...series].sort((left, right) =>
      left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
    );
    const mappings = resolveManualSeriesTeamMappings(orderedSeries);
    if (mappings == null) {
      return null;
    }
    return this.deriveFixSeriesOutcome(mapManualSeriesToStableTeams(orderedSeries, mappings));
  }

  protected async showManualSeriesPreview(
    interactionToken: string,
    locale: string,
    {
      metadata,
      series,
      derivedSeriesOutcome,
    }: { metadata: ManualFlowMetadata; series: MatchStats[]; derivedSeriesOutcome: FixSeriesOutcome | null },
  ): Promise<void> {
    const { discordService, haloService } = this.services;
    const teams = Preconditions.checkExists(metadata.teams, "Expected manual series teams");
    const selectedSeriesOutcome = metadata.selectedSeriesOutcome ?? derivedSeriesOutcome ?? undefined;
    const derivedResultLabel =
      derivedSeriesOutcome == null
        ? "Could not determine automatically"
        : this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, teams);
    const selectedResultLabel =
      selectedSeriesOutcome == null
        ? "Select a final result"
        : this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, teams);
    const teamMappings = resolveManualSeriesTeamMappings(series);
    const displaySeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);
    const seriesEmbed = await this.createManualSeriesEmbed(metadata, displaySeries, locale);
    const derivedScore = haloService.getSeriesScore(displaySeries, locale, true);
    const finalScore = this.getManualSeriesScoreOverride(metadata, locale, true) ?? derivedScore;

    const message = await discordService.updateDeferredReply(interactionToken, {
      embeds: [
        this.createStatusEmbed(
          `Preview generated. Adjust the final result or score if needed, then confirm to post the series stats.\nDerived result: ${derivedResultLabel} (${derivedScore})\nFinal result: ${selectedResultLabel} (${finalScore})`,
        ),
        ...seriesEmbed.embeds,
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.ManualOutcomeSelect,
              min_values: 1,
              max_values: 1,
              options: this.getFixSeriesOutcomeOptions(teams, selectedSeriesOutcome),
            },
          ],
        },
        this.createManualActionRow(metadata, [
          {
            type: ComponentType.Button,
            custom_id: InteractionButton.ManualConfirm,
            label: "Confirm",
            style: ButtonStyle.Success,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionButton.ManualAdjustScore,
            label: "Adjust score",
            style: ButtonStyle.Primary,
          },
        ]),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, selectedSeriesOutcome });
  }

  protected async createManualSeriesEmbed(
    metadata: ManualFlowMetadata,
    series: MatchStats[],
    locale: string,
    queueChannelId?: string,
  ): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    return new SeriesOverviewEmbed({ discordService, haloService }).getEmbed({
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      ...(queueChannelId == null
        ? {}
        : { sourceUrl: `https://discord.com/channels/${metadata.guildId}/${queueChannelId}` }),
      pagesUrl: this.env.PAGES_URL,
      locale,
      queue: metadata.queueNumber,
      series,
      finalTeams: toSeriesOverviewTeams(Preconditions.checkExists(metadata.teams, "Expected manual series teams")),
      substitutions: [],
      hideTeamsDescription: false,
      seriesScore: this.getManualSeriesScoreOverride(metadata, locale, true),
    });
  }

  private async handleManualScoreSubmitJob(
    interaction: APIModalSubmitInteraction,
    seriesScore: ManualSeriesScore,
  ): Promise<void> {
    const { discordService } = this.services;
    try {
      const messageId = Preconditions.checkExists(interaction.message, "Expected modal to come from a message").id;
      const metadata = await this.getManualMetadataWithRetry(messageId);
      const series = await this.getManualSeriesMatches(metadata.selectedMatchIds ?? []);

      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, seriesScore, selectedSeriesOutcome: getOutcomeForManualSeriesScore(seriesScore) },
        series,
        derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
