import { CommandInteraction, SharedSlashCommand } from "discord.js";
import { Services } from "../../services/install.mjs";

export abstract class BaseCommand {
  constructor(readonly services: Services) {}

  abstract data: SharedSlashCommand;

  abstract execute(interaction: CommandInteraction): Promise<void>;
}
