import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";

export abstract class BaseTableEmbed {
  protected addEmbedFields(embed: APIEmbed, titles: string[], data: string[][]): void {
    for (let column = 0; column < titles.length; column++) {
      embed.fields ??= [];
      embed.fields.push({
        name: Preconditions.checkExists(titles[column]),
        value: data
          .slice(1)
          .map((row) => (row[column] != null && row[column] !== "" ? row[column] : "‎ "))
          .join("\n"),
        inline: true,
      });
    }
  }
}
