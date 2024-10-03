import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { BaseCommand } from "../base/base.mjs";

export class PingCommand implements BaseCommand {
  data: SlashCommandBuilder = new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!");

  async execute(interaction: CommandInteraction): Promise<void> {
    await interaction.reply("Pong!");
  }
}
