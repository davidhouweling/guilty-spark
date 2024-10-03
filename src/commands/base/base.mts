import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export abstract class BaseCommand {
  abstract data: SlashCommandBuilder;

  abstract execute(interaction: CommandInteraction): Promise<void>;
}
