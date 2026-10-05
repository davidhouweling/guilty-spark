import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import {
  mapManualSeriesToStableTeams,
  resolveManualSeriesTeamMappings,
} from "../../services/halo/manual-series-team-mapping";
import {
  deriveManualSeriesTeams,
  findGuildMemberIdForGamertag,
  getManualSeriesFinalMatch,
  getManualSeriesPlayerXuids,
} from "./manual-series";
import type { ManualSeriesTeam } from "./manual-series";
import { StatsManualPreviewCommand } from "./stats-manual-preview-command";

export abstract class StatsManualGamesCommand extends StatsManualPreviewCommand {
  protected async handleManualGamesSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedMatchIds = interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const series = await this.getManualSeriesMatches(selectedMatchIds);
      if (series.some((match) => match.Teams.length !== 2)) {
        throw new EndUserError("Manual series stats only support games between two teams.");
      }

      const teams = await this.resolveManualSeriesTeams(metadata.guildId, series);
      const derivedSeriesOutcome = this.deriveManualSeriesOutcome(series);
      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, selectedMatchIds, teams, selectedSeriesOutcome: derivedSeriesOutcome ?? undefined },
        series,
        derivedSeriesOutcome,
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async resolveManualSeriesTeams(guildId: string, series: MatchStats[]): Promise<ManualSeriesTeam[]> {
    const { databaseService, haloService } = this.services;
    const mappings = resolveManualSeriesTeamMappings(series);
    const displaySeries = mappings == null ? series : mapManualSeriesToStableTeams(series, mappings);
    const finalMatch = Preconditions.checkExists(getManualSeriesFinalMatch(displaySeries), "Expected a final match");
    const xuids = getManualSeriesPlayerXuids(finalMatch);
    const [associations, xuidToGamertag] = await Promise.all([
      databaseService.getDiscordAssociationsByXboxId(xuids),
      haloService.getPlayerXuidsToGametags(finalMatch),
    ]);

    const xuidToDiscordId = new Map(associations.map((association) => [association.XboxId, association.DiscordId]));
    const assignedDiscordIds = new Set(xuidToDiscordId.values());
    const fallbackCandidates = new Map<string, string>();
    const candidateXuidsByDiscordId = new Map<string, Set<string>>();
    for (const xuid of xuids) {
      const gamertag = xuidToGamertag.get(xuid);
      if (xuidToDiscordId.has(xuid) || gamertag == null) {
        continue;
      }

      const discordId = await this.findGuildMemberIdForGamertag(guildId, gamertag);
      if (discordId == null) {
        continue;
      }

      fallbackCandidates.set(xuid, discordId);
      const candidateXuids = candidateXuidsByDiscordId.get(discordId) ?? new Set<string>();
      candidateXuids.add(xuid);
      candidateXuidsByDiscordId.set(discordId, candidateXuids);
    }

    for (const [xuid, discordId] of fallbackCandidates) {
      if (candidateXuidsByDiscordId.get(discordId)?.size !== 1 || assignedDiscordIds.has(discordId)) {
        continue;
      }

      xuidToDiscordId.set(xuid, discordId);
      assignedDiscordIds.add(discordId);
    }

    return deriveManualSeriesTeams(finalMatch, xuidToGamertag, xuidToDiscordId);
  }

  private async findGuildMemberIdForGamertag(guildId: string, gamertag: string): Promise<string | undefined> {
    try {
      const queries = [...new Set([gamertag, gamertag.replace(/\s/g, "")])];
      const searchResults = await Promise.all(
        queries.map(async (query) => this.services.discordService.searchGuildMembers(guildId, query)),
      );
      return findGuildMemberIdForGamertag(gamertag, searchResults.flat());
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["reason", "Failed to search guild members for manual series gamertag"],
        ]),
      );
    }

    return undefined;
  }
}
