import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { MatchHistoryEntry } from "../services/halo/types.mjs";
import { EmbedColors } from "./colors.mjs";
import { InteractionComponent } from "./live-tracker-embed.mjs";

const titlePrefix = "Select matches for ";
const maxOptionLabelLength = 100;

interface LiveTrackerIndividualMatchSelectEmbedData {
  gamertag: string;
  locale: string;
  matches: MatchHistoryEntry[];
}

interface MatchSelectionRow {
  matchId: string;
  matchType: string;
  gameTypeAndMap: string;
  result: string;
}

export class LiveTrackerIndividualMatchSelectEmbed {
  private readonly data: LiveTrackerIndividualMatchSelectEmbedData;

  constructor(data: LiveTrackerIndividualMatchSelectEmbedData) {
    this.data = data;
  }

  toMessageData(): APIInteractionResponseCallbackData {
    const rows = this.getMatchRows();

    return {
      embeds: [this.buildEmbed(rows)],
      components: this.buildComponents(rows),
    };
  }

  static getTitlePrefix(): string {
    return titlePrefix;
  }

  private buildEmbed(rows: MatchSelectionRow[]): APIEmbed {
    const { gamertag } = this.data;

    return {
      title: `${titlePrefix}${gamertag}`,
      color: EmbedColors.INFO,
      description: [
        "Select 0-25 matches to seed tracking.",
        "Leaving this empty starts tracking from now forward.",
      ].join("\n"),
      fields: [
        {
          name: "Type",
          value: rows.map((row) => row.matchType).join("\n"),
          inline: true,
        },
        {
          name: "Map / Mode",
          value: rows.map((row) => row.gameTypeAndMap).join("\n"),
          inline: true,
        },
        {
          name: "Result",
          value: rows.map((row) => row.result).join("\n"),
          inline: true,
        },
      ],
    };
  }

  private buildComponents(rows: MatchSelectionRow[]): APIMessageTopLevelComponent[] {
    return [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: InteractionComponent.IndividualMatchSelect,
            min_values: 0,
            max_values: rows.length,
            options: this.getSelectOptions(rows),
            placeholder: "Select matches (optional)",
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.IndividualStartWithoutGames,
            label: "Start without previous games",
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ];
  }

  private getSelectOptions(rows: MatchSelectionRow[]): APISelectMenuOption[] {
    return rows.map((row) => ({
      label: this.truncateLabel(`${row.matchType} | ${row.gameTypeAndMap} | ${row.result}`),
      value: row.matchId,
    }));
  }

  private truncateLabel(label: string): string {
    if (label.length <= maxOptionLabelLength) {
      return label;
    }

    return `${label.slice(0, maxOptionLabelLength - 3)}...`;
  }

  private getMatchTypeLabel(isMatchmaking: boolean): string {
    return isMatchmaking ? "Matchmaking" : "Custom/Local";
  }

  private getMatchRows(): MatchSelectionRow[] {
    const { matches } = this.data;

    return matches.map((match) => {
      const matchTypePrefix = match.isMatchmaking ? "[Matchmaking]" : "[Custom]";
      const gameTypeAndMap = `${matchTypePrefix} ${match.modeName}: ${match.mapName}`;

      return {
        matchId: match.matchId,
        matchType: this.getMatchTypeLabel(match.isMatchmaking),
        gameTypeAndMap,
        result: match.resultString,
      };
    });
  }
}
