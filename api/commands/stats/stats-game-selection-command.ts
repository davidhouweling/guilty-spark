import type { APISelectMenuOption } from "discord-api-types/v10";
import { MatchType } from "halo-infinite-api";
import { formatDistanceToNowStrict } from "date-fns";
import type { MatchHistoryEntry } from "../../services/halo/types";
import { EndUserError } from "../../base/end-user-error";
import { StatsNeatQueueDirectCommand } from "./stats-neatqueue-direct-command";

export abstract class StatsGameSelectionCommand extends StatsNeatQueueDirectCommand {
  protected async getRecentCustomGames(discordUserId: string, locale: string): Promise<MatchHistoryEntry[]> {
    const { databaseService, haloService } = this.services;

    const [association] = await databaseService.getDiscordAssociations([discordUserId]);
    if (association?.XboxId == null || association.XboxId === "") {
      throw new EndUserError("That player does not have a linked Xbox account.");
    }

    const [user] = await haloService.getUsersByXuids([association.XboxId]);
    if (user == null) {
      throw new EndUserError("Could not find a Halo account for that player.");
    }

    const matchHistory = await haloService.getEnrichedMatchHistory(user.gamertag, locale, MatchType.Custom, 25);
    if (matchHistory.matches.length === 0) {
      throw new EndUserError("No recent custom games were found for that player.");
    }

    return matchHistory.matches;
  }

  protected toGameSelectOptions(
    matches: readonly MatchHistoryEntry[],
    preselectedMatchIds: ReadonlySet<string>,
  ): APISelectMenuOption[] {
    return matches.map<APISelectMenuOption>((match) => {
      const label = this.getFixGameSelectionLabel(match.modeName, match.mapName, match.resultString);
      return {
        label: label.slice(0, 100),
        value: match.matchId,
        description: this.getFixGameSelectionDescription(match.endTime, match.endTimeIso).slice(0, 100),
        default: preselectedMatchIds.has(match.matchId),
      };
    });
  }

  private getFixGameSelectionLabel(modeName: string, mapName: string, result: string): string {
    return `${modeName} ${mapName} - ${result}`;
  }

  private getFixGameSelectionDescription(endTime: string, endTimeIso: string): string {
    if (endTimeIso === "") {
      return `Ended at ${endTime}`;
    }

    const endDate = new Date(endTimeIso);
    if (Number.isNaN(endDate.getTime())) {
      return `Ended at ${endTime}`;
    }

    const absoluteUtc = `${endDate.toISOString().replace("T", " ").slice(0, 16)} UTC`;
    if (endDate.getTime() > Date.now()) {
      return `Ended at ${absoluteUtc}`;
    }

    const relative = formatDistanceToNowStrict(endDate, { addSuffix: true });
    return `Ended ${relative} (${absoluteUtc})`;
  }
}
