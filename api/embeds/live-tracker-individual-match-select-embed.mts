import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { PlayerMatchHistory, MatchStats } from "halo-infinite-api";
import type { HaloService } from "../services/halo/halo.mjs";
import { Preconditions } from "../base/preconditions.mjs";
import { EmbedColors } from "./colors.mjs";
import { InteractionComponent } from "./live-tracker-embed.mjs";

const titlePrefix = "Select matches for ";
const maxOptionLabelLength = 100;

interface LiveTrackerIndividualMatchSelectEmbedServices {
  haloService: HaloService;
}

interface LiveTrackerIndividualMatchSelectEmbedData {
  gamertag: string;
  locale: string;
  matches: PlayerMatchHistory[];
}

interface MatchSelectionRow {
  matchId: string;
  matchType: string;
  gameTypeAndMap: string;
  result: string;
}

export class LiveTrackerIndividualMatchSelectEmbed {
  private readonly services: LiveTrackerIndividualMatchSelectEmbedServices;
  private readonly data: LiveTrackerIndividualMatchSelectEmbedData;

  constructor(
    services: LiveTrackerIndividualMatchSelectEmbedServices,
    data: LiveTrackerIndividualMatchSelectEmbedData,
  ) {
    this.services = services;
    this.data = data;
  }

  async toMessageData(): Promise<APIInteractionResponseCallbackData> {
    const rows = await this.getMatchRows();

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

  private getMatchTypeLabel(playlist: object | null | undefined): string {
    return playlist != null ? "Matchmaking" : "Custom/Local";
  }

  private async getMatchRows(): Promise<MatchSelectionRow[]> {
    const { haloService } = this.services;
    const { matches, locale } = this.data;
    const matchIds = matches.map((match) => match.MatchId);
    const matchDetails = await haloService.getMatchDetails(matchIds);
    const matchDetailsById = new Map<string, MatchStats>(matchDetails.map((match) => [match.MatchId, match]));

    return Promise.all(
      matches.map(async (match) => {
        const matchDetail = Preconditions.checkExists(
          matchDetailsById.get(match.MatchId),
          `Cannot find match with match id ${match.MatchId}`,
        );
        const gameTypeAndMap = await haloService.getGameTypeAndMap(match.MatchInfo);
        const outcome = haloService.getMatchOutcome(match.Outcome);
        const { gameScore, gameSubScore } = haloService.getMatchScore(matchDetail, locale);
        const result = `${outcome} - ${gameScore}${gameSubScore != null ? ` (${gameSubScore})` : ""}`;

        return {
          matchId: match.MatchId,
          matchType: this.getMatchTypeLabel(match.MatchInfo.Playlist),
          gameTypeAndMap,
          result,
        };
      }),
    );
  }
}
