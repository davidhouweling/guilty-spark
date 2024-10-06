import { Client, CommandInteraction, SharedSlashCommand } from "discord.js";

export abstract class BaseCommand {
  constructor(readonly client: Client) {}

  abstract data: SharedSlashCommand;

  abstract execute(interaction: CommandInteraction): Promise<void>;
}
