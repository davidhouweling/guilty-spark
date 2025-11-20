import type { APIEmbed } from "discord-api-types/v10";
import { MatchType } from "halo-infinite-api";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EmbedColors } from "../colors.mjs";

interface ConnectHistoryEmbedServices {
  discordService: DiscordService;
  haloService: HaloService;
}

interface ConnectHistoryEmbedData {
  gamertag: string;
  locale: string;
  title?: string;
  description?: string;
}

export class ConnectHistoryEmbed {
  private readonly services: ConnectHistoryEmbedServices;
  private readonly data: ConnectHistoryEmbedData;

  constructor(services: ConnectHistoryEmbedServices, data: ConnectHistoryEmbedData) {
    this.services = services;
    this.data = data;
  }

  async getEmbed(): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const { gamertag, locale, title, description } = this.data;
    const recentHistory = await haloService.getRecentMatchHistory(gamertag, MatchType.Custom);

    return {
      title: title ?? `Recent custom game matches for "${gamertag}"`,
      description: description ?? "",
      color: EmbedColors.INFO,
      fields: recentHistory.length
        ? [
            {
              name: "Game",
              value: (
                await Promise.all(
                  recentHistory.map(async (match) => await haloService.getGameTypeAndMap(match.MatchInfo)),
                )
              ).join("\n"),
              inline: true,
            },
            {
              name: "Result",
              value: (
                await Promise.all(
                  recentHistory.map(async (match) => {
                    const outcome = haloService.getMatchOutcome(match.Outcome);
                    const [matchDetail] = await haloService.getMatchDetails([match.MatchId]);
                    const matchScore = haloService.getMatchScore(
                      Preconditions.checkExists(matchDetail, `Cannot find match with match id ${match.MatchId}`),
                      locale,
                    );

                    return `${outcome} - ${matchScore}`;
                  }),
                )
              ).join("\n"),
              inline: true,
            },
            {
              name: "When",
              value: recentHistory.map((match) => discordService.getTimestamp(match.MatchInfo.EndTime, "R")).join("\n"),
              inline: true,
            },
          ]
        : [
            {
              name: "No custom game matches found",
              value: [
                "To resolve, either:",
                "- In game:",
                '  1. Open "Settings"',
                '  2. Navigate to "Accessibility" tab',
                "  3. Scroll down to Match History Privacy",
                '  4. Set the "Matchmade Games" option to "Share"',
                '  5. Set the "Non-Matchmade Games" option to "Share"',
                "  6. Close the settings menu",
                "- Go to [**Halo Waypoint Privacy settings 🔗**](https://www.halowaypoint.com/settings/privacy)",
                '  1. Select "Show Matchmade Game History"',
                '  2. Select "Show Non-Matchmade Game History"',
                "",
                "Once you have done this, search for your gamertag again.",
              ].join("\n"),
            },
          ],
    };
  }
}
