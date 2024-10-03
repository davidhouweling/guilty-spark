import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { Preconditions } from "./utils/preconditions.mjs";
import { commands } from "./commands/commands.mjs";

const DISCORD_TOKEN = Preconditions.checkExists(process.env["DISCORD_TOKEN"]);

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
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
await client.login(DISCORD_TOKEN);
