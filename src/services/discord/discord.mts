import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { BaseCommand } from "../../commands/base/base.mjs";
import { config } from "../../config.mjs";

export class DiscordService {
  readonly client = new Client({ intents: [GatewayIntentBits.Guilds] });

  async activate(commands: Collection<string, BaseCommand>) {
    // When the client is ready, run this code (only once).
    // The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
    // It makes some properties non-nullable.
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

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

    // Log in to Discord with your client's token
    await this.client.login(config.DISCORD_TOKEN);
  }
}
