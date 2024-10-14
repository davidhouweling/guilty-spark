import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { BaseCommand } from "../../commands/base/base.mjs";
import { config } from "../../config.mjs";

export class DiscordService {
  readonly client = new Client({ intents: [GatewayIntentBits.Guilds] });

  async activate(commands: Collection<string, BaseCommand>) {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

    this.addEventHandlers(commands);

    await this.client.login(config.DISCORD_TOKEN);
  }

  private addEventHandlers(commands: Collection<string, BaseCommand>) {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        void command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          void interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
        } else {
          void interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
        }
      }
    });
  }
}
