import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import type { DiscordService } from "../services/discord/discord";
import { GAMECOACH_GG_URLS } from "../commands/maps/gamecoachgg";
import { BaseTableEmbed } from "./base-table-embed";

const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;

function exceedsDiscordFieldLimit(row: string[], columnLengths: number[], hasPreviousRows: boolean): boolean {
  for (let column = 0; column < row.length; column++) {
    const nextLength = (columnLengths[column] ?? 0) + (hasPreviousRows ? 1 : 0) + (row[column]?.length ?? 0);
    if (nextLength > DISCORD_EMBED_FIELD_VALUE_LIMIT) {
      return true;
    }
  }
  return false;
}

class MapTableFieldsBuilder extends BaseTableEmbed {
  public build(
    discordService: DiscordService,
    maps: readonly { mode: string; map: string }[],
    firstGameNumber: number,
  ): APIEmbedField[] {
    const titles = ["#", "Mode", "Map"];
    const rows = maps.map(({ mode, map }, index) => {
      const gamecoachGgUrl = GAMECOACH_GG_URLS[map];
      const mapDisplay =
        gamecoachGgUrl != null ? `[${map} ${discordService.getEmojiFromName("GameCoachGG")}](${gamecoachGgUrl})` : map;
      return [(firstGameNumber + index).toString(), mode, mapDisplay];
    });

    const embed: APIEmbed = {};
    this.addMapFields(embed, titles, rows);
    return embed.fields ?? [];
  }

  private addMapFields(embed: APIEmbed, titles: string[], rows: string[][]): void {
    let chunk: string[][] = [];
    let columnLengths = titles.map(() => 0);

    for (const row of rows) {
      if (exceedsDiscordFieldLimit(row, columnLengths, chunk.length > 0) && chunk.length > 0) {
        this.addEmbedFields(embed, titles, [titles, ...chunk]);
        chunk = [];
        columnLengths = titles.map(() => 0);
      }

      chunk.push(row);
      for (let column = 0; column < row.length; column++) {
        columnLengths[column] = (columnLengths[column] ?? 0) + (chunk.length > 1 ? 1 : 0) + (row[column]?.length ?? 0);
      }
    }

    if (chunk.length > 0) {
      this.addEmbedFields(embed, titles, [titles, ...chunk]);
    }
  }
}

export function createMapTableFields(
  discordService: DiscordService,
  maps: readonly { mode: string; map: string }[],
  firstGameNumber = 1,
): APIEmbedField[] {
  return new MapTableFieldsBuilder().build(discordService, maps, firstGameNumber);
}